/**
 * @file worker/server/actions/qax/run.ts
 * @description Running the items of a qax action or macro on a scene, for
 * any caller: the console (`run x.qax`) and the Action library pane.
 *
 * An `<op>` runs as an MCP call does: its arguments are read by
 * `readToolArgs`, with node paths resolved in the scene, and the op goes
 * through `invokeOp`. A `<cmd>` is a native console line, which only a caller
 * with a console runs (`runLine`); others refuse it. A `<note>` is skipped.
 *
 * A macro's items first have their parameters bound (`bindMacroItems`): an
 * argument with `param` becomes the path of the object bound to it, with
 * `sub` the path of the renderer of that name under it.
 *
 * Unlike the rest of `qax/`, this module uses the op catalogue; the format
 * modules beside it stay free of the worker.
 */

import { findOp, invokeOp, readToolArgs } from '@renderer/worker/server/catalog'
import type { OpContext } from '@renderer/worker/server/catalog'
import type { Param } from '@renderer/worker/server/catalog/params'
import { resolveRef } from '@renderer/worker/server/catalog/refs'
import type { RefKind } from '@renderer/worker/server/catalog/refs'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { MacroShape } from '@renderer/worker/shared/actionLibraryTypes'
import type { QaxItem, QaxMacro } from './model'
import { qaxToInput } from './values'

/** What running items needs from its caller. */
export interface QaxExec {
  ctx: WorkerContext
  sceneId: number
  /** The context an op runs in (sceneId, viewId, mutation, streams). */
  opContext(): OpContext
  /** Whether the caller was stopped; checked before each item. */
  stopped(): boolean
  /** Run one native console line; absent where there is no console. */
  runLine?(text: string): Promise<boolean>
  /** Report why an item failed. */
  error(text: string): void
}

const REF_KIND: Readonly<Record<string, RefKind>> = {
  object: 'object',
  renderer: 'renderer',
  node: 'node',
}

/** The uid a node argument names in the scene. */
function resolveNode(ctx: WorkerContext, sceneId: number) {
  return (ref: { path?: string; uid?: number }, p: Param<unknown>, argName: string): number | { error: string } => {
    const kind = REF_KIND[p.semantic ?? ''] ?? 'node'
    // The path is what carries over to another session; the uid only when
    // there is no path to look up.
    const text = ref.path ?? (ref.uid !== undefined ? `#${ref.uid}` : '')
    const hit = resolveRef(ctx, sceneId, text, kind, p.objClass)
    return hit.ok ? hit.node.id : { error: `${argName}: ${hit.error}` }
  }
}

/** Run one `<op>`. */
async function runOp(item: Extract<QaxItem, { kind: 'op' }>, x: QaxExec): Promise<boolean> {
  const op = findOp(item.name)
  if (!op) {
    x.error(`Error: unknown op "${item.name}"`)
    return false
  }
  const read = qaxToInput(item, op.params, resolveNode(x.ctx, x.sceneId))
  if (!read.ok) {
    x.error(`Error: ${item.name}: ${read.error}`)
    return false
  }
  const input = read.input
  if (op.outsideTxn?.(input)) {
    x.error(`Error: ${item.name} cannot run from a qax file (it opens or saves a scene)`)
    return false
  }
  const args = readToolArgs(op, input)
  if (typeof args === 'string') {
    x.error(`Error: ${item.name}: ${args}`)
    return false
  }
  const oc = x.opContext()
  const outcome = await invokeOp(op, x.ctx, args, oc)
  if (!outcome.ok) {
    x.error(`Error: ${item.name}: ${outcome.error}`)
    return false
  }
  if (op.mutates) oc.markMutated()
  return true
}

/**
 * Run items in order, stopping at the first failure or when stopped.
 *
 * @returns whether every item ran.
 */
export async function runQaxItems(items: readonly QaxItem[], x: QaxExec): Promise<boolean> {
  for (const item of items) {
    if (x.stopped()) return false
    if (item.kind === 'note') continue
    if (item.kind === 'cmd') {
      if (!x.runLine) {
        x.error(`Error: a <cmd> line runs only in the console: ${item.text}`)
        return false
      }
      if (!(await x.runLine(item.text))) return false
      continue
    }
    if (!(await runOp(item, x))) return false
  }
  return true
}

/**
 * A macro's items with its parameters bound to object paths.
 *
 * @param paths - the path (`obj`) each parameter is bound to.
 */
export function bindMacroItems(macro: QaxMacro, paths: Readonly<Record<string, string>>): QaxItem[] | { error: string } {
  const out: QaxItem[] = []
  for (const item of macro.items) {
    if (item.kind !== 'op') {
      out.push(item)
      continue
    }
    const args = []
    for (const a of item.args) {
      if (a.param === undefined) {
        args.push(a)
        continue
      }
      const obj = paths[a.param]
      if (obj === undefined) return { error: `nothing is bound to param "${a.param}"` }
      args.push({ name: a.name, path: a.sub !== undefined ? `${obj}/${a.sub}` : obj })
    }
    out.push({ ...item, args })
  }
  return out
}

/**
 * What a macro needs to run, as the Library can run it: one object
 * parameter (bound to the selected object), or none.
 */
export function macroShape(macro: QaxMacro): MacroShape {
  if (macro.params.length === 0) return { kind: 'none' }
  if (macro.params.length === 1) return { kind: 'target', targetType: macro.params[0].type }
  return { kind: 'unsupported', reason: `It takes ${macro.params.length} parameters; only one object can be bound for now.` }
}
