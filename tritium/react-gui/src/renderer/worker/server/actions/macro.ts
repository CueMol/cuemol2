/**
 * @file worker/server/actions/macro.ts
 * @description Undo steps of the action log made into a macro: the same ops,
 * with the one object they act on turned into the macro's parameter, so it
 * can be run on another object.
 *
 * - A node argument naming that object becomes `param="target"`; one naming
 *   a renderer under it becomes `param="target" sub="<renderer>"`.
 * - Only a renderer the steps themselves create (a `create_renderer` or
 *   `create_group` with an explicit name, earlier in the steps) may be named
 *   that way: one made before the steps exists under the object it was
 *   recorded on, not under another, so a macro naming it would fail there.
 * - Steps that act on two objects, or name a node by uid only, cannot be a
 *   macro of one parameter; why is returned instead.
 * - Steps that name no node at all make a macro without parameters.
 */

import type { ActionRow } from './actionLog'
import { entryToQax } from './export'
import type { QaxArg, QaxItem, QaxMacro, QaxParam } from './qax/model'

/** The parameter a macro made from steps takes. */
export const MACRO_TARGET = 'target'

/** The ops that create a named renderer under their `objId`. */
const CREATES_RENDERER: ReadonlySet<string> = new Set(['create_renderer', 'create_group'])

export interface StepsToMacroOptions {
  name: string
  label?: string
  /** The qif class of the object at `path` (e.g. `MolCoord`), for the parameter's type. */
  classOf(path: string): string
}

export type StepsToMacroResult = { ok: true; macro: QaxMacro } | { ok: false; error: string }

/** `obj/rend` -> [`obj`, `rend`]; `obj` -> [`obj`, null]. */
function splitPath(path: string): [string, string | null] {
  const at = path.indexOf('/')
  return at < 0 ? [path, null] : [path.slice(0, at), path.slice(at + 1)]
}

/**
 * Make one macro of the given steps, in log order.
 *
 * @returns the macro, or why these steps cannot be one.
 */
export function stepsToMacro(rows: readonly ActionRow[], opts: StepsToMacroOptions): StepsToMacroResult {
  let target: string | null = null
  const created = new Set<string>()
  const items: QaxItem[] = []

  for (const row of rows) {
    if (row.entries.length === 0) {
      items.push({ kind: 'note', text: `no op recorded for: ${row.label}` })
      continue
    }
    for (const entry of row.entries) {
      if (entry.kind === 'note' && entry.dropped) {
        return { ok: false, error: `"${row.label}" was not recorded (${entry.dropped.op}, too large), so it cannot run again.` }
      }
      const item = entryToQax(entry)
      if (item.kind !== 'op') {
        items.push(item)
        continue
      }
      const args: QaxArg[] = []
      for (const a of item.args) {
        if (a.uid === undefined && a.path === undefined) {
          args.push(a)
          continue
        }
        if (a.path === undefined) {
          return { ok: false, error: `${item.name} names a node that had no unique name when it ran` }
        }
        const [obj, rend] = splitPath(a.path)
        if (target === null) target = obj
        else if (obj !== target) {
          return { ok: false, error: `The steps act on two objects (${target} and ${obj}); a macro takes one.` }
        }
        if (rend !== null && !created.has(a.path)) {
          return {
            ok: false,
            error: `${item.name} acts on ${a.path}, which these steps do not create. Select the step that creates it too.`,
          }
        }
        args.push(rend === null ? { name: a.name, param: MACRO_TARGET } : { name: a.name, param: MACRO_TARGET, sub: rend })
      }
      items.push({ ...item, args })
      // Its own arguments are read first: the renderer exists only after it.
      if (entry.kind === 'op' && CREATES_RENDERER.has(entry.op)) {
        const obj = entry.refs.objId
        const name = entry.args.name
        if (obj !== undefined && typeof name === 'string' && name !== '') created.add(`${obj}/${name}`)
      }
    }
  }

  const params: QaxParam[] = target === null ? [] : [{ name: MACRO_TARGET, type: opts.classOf(target), label: 'Target' }]
  const macro: QaxMacro = { name: opts.name, params, items }
  if (opts.label !== undefined) macro.label = opts.label
  return { ok: true, macro }
}
