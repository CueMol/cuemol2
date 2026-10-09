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
import { ANIM_OPS } from './ops/animOps'
import { APBS_OPS } from './ops/apbsOps'
import { EDIT_OPS } from './ops/editOps'
import { TOOL_MENU_OPS } from './ops/toolOps'
import { FILE_OPS } from './ops/fileOps'
import { MEASURE_OPS } from './ops/measureOps'
import { PROP_OPS } from './ops/propOps'
import { RENDERER_OPS } from './ops/rendererOps'
import { SCENE_OPS } from './ops/sceneOps'
import { SELECTION_OPS } from './ops/selectionOps'
import { VIEW_OPS } from './ops/viewOps'
import { CAMERA_OPS } from './ops/cameraOps'
import { MAP_OPS } from './ops/mapOps'
import { MOL_OPS } from './ops/molOps'
import { MORE_OPS } from './ops/moreOps'
import { RENDER_OPS } from './ops/renderOps'
import type { ToolsetId } from './toolsets'

export type { AnyOp, Op, OpContext, OpImage, OpOutcome, OpAlias } from './op'
export { defineOp } from './op'
export { invokeOp, runExclusive, runInTxn, TXN_BUSY_MESSAGE, txnBusy, txnLabel } from './opRuntime'
export { MAX_ARRAY_ITEMS, MAX_OUTPUT_CHARS, serializeToolOutput } from './toolOutput'
export { paramsSchema, readToolArgs, toolSchema } from './toolSchema'
export type { StrictObjectSchema } from './toolSchema'
export { TOOLSETS } from './toolsets'
export type { Toolset, ToolsetId } from './toolsets'

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
  ...VIEW_OPS,
  ...CAMERA_OPS,
  ...MAP_OPS,
  ...MOL_OPS,
  ...MORE_OPS,
  ...RENDER_OPS,
  ...APBS_OPS,
  ...TOOL_MENU_OPS,
  ...ANIM_OPS,
  ...EDIT_OPS,
].sort(byName)

/** The ops always offered to a tool caller, in catalogue order. */
export const TOOL_OPS: readonly AnyOp[] = OPS.filter((op) => op.expose.tool === 'core')

/** The ops one toolset adds once it is switched on, in catalogue order. */
export function toolsetOps(id: ToolsetId): readonly AnyOp[] {
  return OPS.filter((op) => op.expose.tool === id)
}

/**
 * The ops an MCP client is offered: every op a tool caller may use, toolsets
 * included (a client picks from all its servers' tools itself), and the
 * MCP-only ones.
 */
export function isMcpOp(op: AnyOp): boolean {
  return op.expose.tool !== false || op.expose.mcp === true
}

/** The ops `isMcpOp` offers, in catalogue order. */
export const MCP_OPS: readonly AnyOp[] = OPS.filter(isMcpOp)

/** The ops a console makes commands of, in catalogue order. */
export const CONSOLE_COMMAND_OPS: readonly AnyOp[] = OPS.filter((op) => op.expose.console)

/** Lookup by name. */
export function findOp(name: string): AnyOp | undefined {
  return OPS.find((op) => op.name === name)
}
