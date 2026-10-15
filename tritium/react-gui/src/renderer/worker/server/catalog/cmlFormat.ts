/**
 * @file worker/server/catalog/cmlFormat.ts
 * @description An op call written as the native console command that makes
 * it, for showing a recorded action to a person.
 *
 * Display only: what is saved and run again is the qax file, which keeps the
 * typed arguments. Every argument is written by name (`set_node_prop
 * nodeType=renderer, nodeId=1crn/cartoon1, ...`), which the native console
 * accepts in any order, so the line does not depend on the positional order.
 */

import type { AtomSpec, ParamMap } from './params'

/** The semantic kinds whose value is a node uid. */
const REF_SEMANTICS = new Set(['object', 'renderer', 'node'])

/** Whether bracket pairs in `text` close in order. */
function balanced(text: string): boolean {
  const stack: string[] = []
  for (const ch of text) {
    if (ch === '(' || ch === '[') stack.push(ch === '(' ? ')' : ']')
    else if (ch === ')' || ch === ']') {
      if (stack.pop() !== ch) return false
    }
  }
  return stack.length === 0
}

/**
 * A value as one console argument: bare when the parser would read it back
 * whole, else in the first quotes it does not contain. The parser has no
 * escapes, so a value holding every kind of quote is shown as JSON.
 */
export function quoteArg(text: string): string {
  const plain = text !== '' && text.trim() === text && !/[,;'"#]/.test(text) && balanced(text)
  if (plain) return text
  if (!text.includes('"')) return `"${text}"`
  if (!text.includes("'")) return `'${text}'`
  if (!text.includes("'''")) return `'''${text}'''`
  return JSON.stringify(text)
}

/**
 * A value of a list argument (a node, a property path, a file a load opens)
 * as one word of that list: quoted when a space would split it or a wildcard
 * would make it a pattern. A wildcard in a node's type (`1crn/@*selection`)
 * is not one.
 */
function listArg(text: string, file: boolean): string {
  const names = file ? [text] : text.split('/').map((seg) => (seg.includes('@') ? seg.slice(0, seg.lastIndexOf('@')) : seg))
  if (!/\s/.test(text) && !names.some((n) => /[*?]/.test(n))) return quoteArg(text)
  return text.includes('"') ? `'${text}'` : `"${text}"`
}

/** Atoms as `chain.resid.name` (CueMol's selection form), joined by `sep`. */
export function atomList(atoms: readonly AtomSpec[], sep = ' '): string {
  return atoms.map((a) => `${a.chain}.${a.resid}.${a.atomName}`).join(sep)
}

/** One argument's value as text, or null when it is left out. */
function argText(value: unknown, kind: string, ref: string | undefined, list: 'node' | 'file' | null): string | null {
  if (value === null || value === undefined) return null
  if (ref !== undefined) return listArg(ref, false)
  if (list !== null && typeof value === 'string') return listArg(value, list === 'file')
  if (kind === 'atoms' && Array.isArray(value)) {
    return atomList(value as AtomSpec[])
  }
  if (kind === 'vec3' && Array.isArray(value)) return value.map(String).join(' ')
  return quoteArg(String(value))
}

/**
 * The console line for one op call.
 *
 * @param refs - the path a node argument had; without one the uid is
 *   written (`#12`), which names the node in this session only.
 */
export function formatCommand(
  name: string,
  params: ParamMap,
  args: Readonly<Record<string, unknown>>,
  refs: Readonly<Record<string, string>> = {},
): string {
  const parts: string[] = []
  for (const [argName, p] of Object.entries(params)) {
    const isRef = REF_SEMANTICS.has(p.semantic ?? '') && typeof args[argName] === 'number'
    const ref = isRef ? (refs[argName] ?? `#${String(args[argName])}`) : undefined
    // The arguments the console reads as lists (fromCatalog.ts).
    const list = p.semantic === 'propPath' ? 'node' : argName === 'path' && p.semantic === 'path' && name.startsWith('load') ? 'file' : null
    const text = argText(args[argName], p.kind, ref, list)
    if (text !== null) parts.push(`${argName}=${text}`)
  }
  return parts.length > 0 ? `${name} ${parts.join(', ')}` : name
}
