/**
 * @file worker/server/catalog/index.ts
 * @description The op catalogue: every operation offered to the callers that
 * drive CueMol by name (the AI agent, the console, an MCP server).
 *
 * Sorted by name and frozen in that order. The agent's tool list is part of
 * its cached prompt prefix, so a catalogue that reordered itself between
 * turns would miss the cache every time for no benefit.
 *
 * Files here are deliberately NOT named `*.service.ts`: the worker registry
 * globs that pattern and would try to register an op module as a service.
 */

import type { AnyOp } from './op'
import { ANALYSIS_OPS } from './ops/analysisOps'
import { CONSOLE_OPS } from './ops/consoleOps'
import { FILE_OPS } from './ops/fileOps'
import { MEASURE_OPS } from './ops/measureOps'
import { PROP_OPS } from './ops/propOps'
import { RENDERER_OPS } from './ops/rendererOps'
import { SCENE_OPS } from './ops/sceneOps'
import { SELECTION_OPS } from './ops/selectionOps'

export type { AnyOp, Op, OpContext, OpImage, OpOutcome, OpVerb } from './op'
export { defineOp } from './op'
export { invokeOp, runInTxn, txnLabel } from './opRuntime'
export { paramsSchema, readToolArgs, toolSchema } from './toolSchema'
export type { StrictObjectSchema } from './toolSchema'

function byName(a: AnyOp, b: AnyOp): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/** Every op. */
export const OPS: readonly AnyOp[] = [
  ...SCENE_OPS,
  ...SELECTION_OPS,
  ...RENDERER_OPS,
  ...PROP_OPS,
  ...FILE_OPS,
  ...ANALYSIS_OPS,
  ...MEASURE_OPS,
  ...CONSOLE_OPS,
].sort(byName)

/** The ops the AI agent offers the model, in catalogue order. */
export const TOOL_OPS: readonly AnyOp[] = OPS.filter((op) => op.expose.tool === 'core')

/** The ops a console makes commands of, in catalogue order. */
export const CONSOLE_COMMAND_OPS: readonly AnyOp[] = OPS.filter((op) => op.expose.console)

/** Lookup by name. */
export function findOp(name: string): AnyOp | undefined {
  return OPS.find((op) => op.name === name)
}
