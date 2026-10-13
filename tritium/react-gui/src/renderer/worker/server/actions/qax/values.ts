/**
 * @file worker/server/actions/qax/values.ts
 * @description An op's typed arguments to qax `<arg>` elements and back,
 * by the op's parameter declarations.
 *
 * Writing: a node uid is written as its path (and the uid as a hint), a
 * `vec3` as `x y z`, a list of atoms as `<atom>` children, anything else as
 * text; a null argument is left out. Reading gives the JSON shape
 * `readToolArgs` takes -- the same reader MCP and the agent use -- with node
 * paths resolved by the caller, which knows the scene.
 */

import type { AtomSpec, Param, ParamMap } from '@renderer/worker/server/catalog/params'
import type { QaxArg, QaxItem } from './model'

/** The semantic kinds whose value is a node uid. */
const REF_SEMANTICS = new Set(['object', 'renderer', 'node'])

/** Whether a parameter takes a node uid. */
export function isRefParam(p: Param<unknown>): boolean {
  return REF_SEMANTICS.has(p.semantic ?? '')
}

/**
 * One op call as a qax `<op>`.
 *
 * @param refs - the path of each node argument, as recorded
 */
export function opToQax(
  name: string,
  params: ParamMap,
  args: Readonly<Record<string, unknown>>,
  refs: Readonly<Record<string, string>> = {},
): QaxItem {
  const out: QaxArg[] = []
  for (const [argName, p] of Object.entries(params)) {
    const v = args[argName]
    if (v === null || v === undefined) continue
    if (isRefParam(p) && typeof v === 'number') {
      out.push({ name: argName, ...(refs[argName] !== undefined ? { path: refs[argName] } : {}), uid: v })
    } else if (p.kind === 'atoms' && Array.isArray(v)) {
      out.push({ name: argName, atoms: (v as AtomSpec[]).map((a) => ({ chain: a.chain, resid: a.resid, name: a.atomName })) })
    } else if (p.kind === 'vec3' && Array.isArray(v)) {
      out.push({ name: argName, text: v.map(String).join(' ') })
    } else {
      out.push({ name: argName, text: String(v) })
    }
  }
  return { kind: 'op', name, args: out }
}

/** How the caller turns a node path (or, failing that, a uid) into a uid. */
export type ResolveNode = (ref: { path?: string; uid?: number }, p: Param<unknown>, argName: string) => number | { error: string }

/**
 * A qax `<op>`'s arguments as the JSON input `readToolArgs` reads.
 *
 * @returns the input, or why an argument cannot be read.
 */
export function qaxToInput(
  item: Extract<QaxItem, { kind: 'op' }>,
  params: ParamMap,
  resolve: ResolveNode,
): { ok: true; input: Record<string, unknown> } | { ok: false; error: string } {
  const input: Record<string, unknown> = {}
  for (const a of item.args) {
    const p = params[a.name]
    if (!p) return { ok: false, error: `no argument "${a.name}"` }
    if (a.path !== undefined || a.uid !== undefined) {
      if (!isRefParam(p)) return { ok: false, error: `"${a.name}" does not take a node` }
      const id = resolve({ path: a.path, uid: a.uid }, p, a.name)
      if (typeof id !== 'number') return { ok: false, error: id.error }
      input[a.name] = id
    } else if (a.atoms) {
      input[a.name] = a.atoms.map((t) => ({ chain: t.chain, resid: t.resid, atomName: t.name }))
    } else if (p.kind === 'vec3') {
      input[a.name] = (a.text ?? '').split(/\s+/).filter((w) => w !== '').map(Number)
    } else {
      input[a.name] = a.text ?? ''
    }
  }
  return { ok: true, input }
}
