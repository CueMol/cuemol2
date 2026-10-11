/**
 * @file worker/server/actions/qax/codec.ts
 * @description Reading and writing a qax file (see `model.ts`).
 *
 * Writing is done by hand so the file is indented one element per line,
 * which keeps a diff of two logs readable. Reading uses `@xmldom/xmldom`,
 * since the worker has no `DOMParser`.
 */

import { DOMParser } from '@xmldom/xmldom'
import type { QaxAction, QaxArg, QaxAtom, QaxDoc, QaxItem } from './model'
import { QAX_ROOT, QAX_VERSION } from './model'

/** Escape text for an XML attribute value or element content. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;')
}

function attrs(pairs: [string, string | number | undefined][]): string {
  return pairs
    .filter((p): p is [string, string | number] => p[1] !== undefined)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('')
}

function writeArg(a: QaxArg, indent: string): string[] {
  const head = `${indent}<arg${attrs([['name', a.name], ['path', a.path], ['uid', a.uid]])}`
  if (a.atoms) {
    return [
      `${head}>`,
      ...a.atoms.map((t) => `${indent}  <atom${attrs([['chain', t.chain], ['resid', t.resid], ['name', t.name]])}/>`),
      `${indent}</arg>`,
    ]
  }
  if (a.text === undefined) return [`${head}/>`]
  return [`${head}>${esc(a.text)}</arg>`]
}

function writeItem(item: QaxItem, indent: string): string[] {
  if (item.kind === 'cmd') return [`${indent}<cmd>${esc(item.text)}</cmd>`]
  if (item.kind === 'note') return [`${indent}<note>${esc(item.text)}</note>`]
  if (item.args.length === 0) return [`${indent}<op${attrs([['name', item.name]])}/>`]
  return [
    `${indent}<op${attrs([['name', item.name]])}>`,
    ...item.args.flatMap((a) => writeArg(a, `${indent}  `)),
    `${indent}</op>`,
  ]
}

function writeAction(action: QaxAction, indent: string): string[] {
  const head = `${indent}<action${attrs([['label', action.label], ['source', action.source], ['time', action.time]])}`
  if (action.items.length === 0) return [`${head}/>`]
  return [`${head}>`, ...action.items.flatMap((i) => writeItem(i, `${indent}  `)), `${indent}</action>`]
}

/** The text of a qax file. */
export function writeQax(doc: QaxDoc): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${QAX_ROOT} version="${doc.version}">`,
    ...doc.actions.flatMap((a) => writeAction(a, '  ')),
    `</${QAX_ROOT}>`,
    '',
  ].join('\n')
}

/** The DOM subset read here, so the reader does not depend on lib.dom. */
interface XNode {
  nodeType: number
  nodeName: string
  textContent: string | null
  childNodes: ArrayLike<XNode>
  getAttribute?(name: string): string | null
  hasAttribute?(name: string): boolean
}

const ELEMENT = 1

function elements(node: XNode): XNode[] {
  return Array.from(node.childNodes).filter((n) => n.nodeType === ELEMENT)
}

function attr(el: XNode, name: string): string | undefined {
  return el.hasAttribute?.(name) ? (el.getAttribute?.(name) ?? undefined) : undefined
}

class QaxError extends Error {}

function readArg(el: XNode): QaxArg {
  const name = attr(el, 'name')
  if (!name) throw new QaxError('<arg> needs a name')
  const out: QaxArg = { name }
  const path = attr(el, 'path')
  const uid = attr(el, 'uid')
  if (path !== undefined) out.path = path
  if (uid !== undefined) {
    const n = Number(uid)
    if (!Number.isInteger(n)) throw new QaxError(`<arg name="${name}">: uid "${uid}" is not a whole number`)
    out.uid = n
  }
  const kids = elements(el)
  if (kids.length > 0) {
    out.atoms = kids.map((k): QaxAtom => {
      if (k.nodeName !== 'atom') throw new QaxError(`<arg name="${name}">: unexpected <${k.nodeName}>`)
      return { chain: attr(k, 'chain') ?? '', resid: attr(k, 'resid') ?? '', name: attr(k, 'name') ?? '' }
    })
  } else if (path === undefined && uid === undefined) {
    out.text = el.textContent ?? ''
  }
  return out
}

function readItem(el: XNode): QaxItem {
  switch (el.nodeName) {
    case 'op': {
      const name = attr(el, 'name')
      if (!name) throw new QaxError('<op> needs a name')
      return {
        kind: 'op',
        name,
        args: elements(el).map((a) => {
          if (a.nodeName !== 'arg') throw new QaxError(`<op name="${name}">: unexpected <${a.nodeName}>`)
          return readArg(a)
        }),
      }
    }
    case 'cmd':
      return { kind: 'cmd', text: el.textContent ?? '' }
    case 'note':
      return { kind: 'note', text: el.textContent ?? '' }
    default:
      throw new QaxError(`<action>: unexpected <${el.nodeName}>`)
  }
}

function readAction(el: XNode): QaxAction {
  const out: QaxAction = { items: elements(el).map(readItem) }
  const label = attr(el, 'label')
  const source = attr(el, 'source')
  const time = attr(el, 'time')
  if (label !== undefined) out.label = label
  if (source !== undefined) out.source = source
  if (time !== undefined) out.time = time
  return out
}

/**
 * Read the text of a qax file.
 *
 * @returns the document, or why it is not one.
 */
export function parseQax(text: string): QaxDoc | { error: string } {
  const problems: string[] = []
  const report = (msg: string): void => { problems.push(String(msg).split('\n')[0]) }
  const dom = new DOMParser({ errorHandler: { warning: () => undefined, error: report, fatalError: report } })
    .parseFromString(text, 'text/xml') as unknown as { documentElement: XNode | null }
  if (problems.length > 0) return { error: `not well-formed XML: ${problems[0]}` }
  const root = dom.documentElement
  if (!root || root.nodeName !== QAX_ROOT) return { error: `the root element is not <${QAX_ROOT}>` }
  const version = Number(attr(root, 'version') ?? NaN)
  if (version !== QAX_VERSION) return { error: `version ${attr(root, 'version') ?? '(none)'} is not supported (only ${QAX_VERSION})` }
  try {
    const actions: QaxAction[] = []
    for (const el of elements(root)) {
      if (el.nodeName === 'macro') throw new QaxError('<macro> is not supported yet')
      if (el.nodeName !== 'action') throw new QaxError(`unexpected <${el.nodeName}>`)
      actions.push(readAction(el))
    }
    return { version, actions }
  } catch (e) {
    if (e instanceof QaxError) return { error: e.message }
    throw e
  }
}
