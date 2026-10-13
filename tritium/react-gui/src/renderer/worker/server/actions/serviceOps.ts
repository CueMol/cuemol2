/**
 * @file worker/server/actions/serviceOps.ts
 * @description What a GUI service did, said as the native op that does the
 * same, for the action log.
 *
 * The GUI does not run ops: a dialog or the inspector calls a worker service
 * directly, and so does the PyMOL dialect. A service that has an op
 * equivalent records that op here, from inside its own transaction, so the
 * row of its edit can be written out and run again. A service that does not
 * leaves its row with only its undo label.
 *
 * Nothing is recorded while an op is running (`insideOp`): an op calls these
 * same services, and the op is what gets recorded.
 *
 * This module does not import the op catalogue (the catalogue imports the
 * services that import this), so each record names the node arguments it
 * carries itself.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { SceneNodeEntry } from '@renderer/worker/server/catalog/refs'
import { nodePath, sceneNodes } from '@renderer/worker/server/catalog/refs'
import type { FileOpenOptions, FormatOptions } from '@renderer/worker/shared/fileOpenTypes'
import { insideOp, noteEntry, txnOpen } from './actionLog'

/** The node kinds the property ops address (a group is a renderer to them). */
type PropNodeType = 'scene' | 'view' | 'object' | 'renderer' | 'rendGroup'

/** Whether a service on this scene should record what it does now. */
function recording(sceneId: number): boolean {
  return txnOpen(sceneId) && !insideOp(sceneId)
}

function nodesOf(ctx: WorkerContext, sceneId: number): SceneNodeEntry[] {
  try {
    return sceneNodes(ctx, sceneId)
  } catch {
    return []
  }
}

/** The unique path of a node, or null when it has none (missing, or a shared name). */
function uniquePath(nodes: SceneNodeEntry[], id: number): string | null {
  const node = nodes.find((n) => n.id === id)
  if (!node) return null
  const path = nodePath(node)
  return nodes.filter((n) => nodePath(n) === path).length === 1 ? path : null
}

/**
 * The most an op's arguments may take in the log (as JSON). Larger ones
 * (a pasted object's XML, with its coordinates) would make a qax file of
 * megabytes; the op is replaced by a note saying it was not kept.
 */
export const MAX_RECORDED_ARGS_BYTES = 64 * 1024

/** `1.8 MB` / `70 KB`. */
function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

/**
 * Record one op with the given typed arguments.
 *
 * @param refParams - the arguments that are node uids, whose current paths
 *   are kept with the record.
 */
export function recordOp(
  ctx: WorkerContext,
  sceneId: number,
  op: string,
  args: Record<string, unknown>,
  refParams: readonly string[] = [],
): void {
  if (!recording(sceneId)) return
  const bytes = JSON.stringify(args).length
  if (bytes > MAX_RECORDED_ARGS_BYTES) {
    noteEntry(sceneId, {
      kind: 'note',
      text: `not recorded: ${op} (${sizeText(bytes)}, over the ${sizeText(MAX_RECORDED_ARGS_BYTES)} limit)`,
      dropped: { op, bytes },
    })
    return
  }
  const refs: Record<string, string> = {}
  if (refParams.length > 0) {
    const nodes = nodesOf(ctx, sceneId)
    for (const name of refParams) {
      const id = args[name]
      if (typeof id !== 'number') continue
      const path = uniquePath(nodes, id)
      if (path !== null) refs[name] = path
    }
  }
  noteEntry(sceneId, { kind: 'op', op, args, refs })
}

/** A property value as the text the property ops take. */
function valueText(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

/** The property path `reset_prop` takes for a node's property. */
function propPathOf(ctx: WorkerContext, sceneId: number, nodeType: PropNodeType, nodeId: number, prop: string): string {
  if (nodeType === 'scene') return prop
  if (nodeType === 'view') return `view.${prop}`
  const path = uniquePath(nodesOf(ctx, sceneId), nodeId)
  return `${path ?? `#${nodeId}`}.${prop}`
}

const PROP_NODE_TYPES: ReadonlySet<string> = new Set<PropNodeType>(['scene', 'view', 'object', 'renderer', 'rendGroup'])

/** One property write or reset, from the generic property services. */
export function recordPropWrite(
  ctx: WorkerContext,
  sceneId: number,
  w: { nodeType: string; nodeId: number; propName: string; op: 'set' | 'reset'; value?: unknown },
): void {
  if (!recording(sceneId) || !PROP_NODE_TYPES.has(w.nodeType)) return
  if (w.op === 'reset') {
    recordOp(ctx, sceneId, 'reset_prop', { path: propPathOf(ctx, sceneId, w.nodeType as PropNodeType, w.nodeId, w.propName) })
    return
  }
  const own = w.nodeType === 'scene' || w.nodeType === 'view'
  recordOp(
    ctx,
    sceneId,
    'set_node_prop',
    {
      nodeType: w.nodeType === 'rendGroup' ? 'renderer' : w.nodeType,
      nodeId: own ? null : w.nodeId,
      prop: w.propName,
      value: valueText(w.value),
    },
    ['nodeId'],
  )
}

/** The tree node kinds the delete and rename ops take. */
type TreeNodeType = 'object' | 'renderer' | 'rendGroup'

function isTreeNode(t: string): t is TreeNodeType {
  return t === 'object' || t === 'renderer' || t === 'rendGroup'
}

/** A scene-tree delete. Style nodes have no op. Call before the node goes. */
export function recordDeleteNode(ctx: WorkerContext, sceneId: number, nodeType: string, nodeId: number): void {
  if (!isTreeNode(nodeType)) return
  recordOp(ctx, sceneId, 'delete_node', { nodeId, nodeType }, ['nodeId'])
}

/** A scene-tree rename. Call before the name changes. */
export function recordRenameNode(ctx: WorkerContext, sceneId: number, nodeType: string, nodeId: number, name: string): void {
  if (nodeType === 'scene') {
    recordOp(ctx, sceneId, 'set_node_prop', { nodeType: 'scene', nodeId: null, prop: 'name', value: name }, ['nodeId'])
    return
  }
  if (!isTreeNode(nodeType)) return
  recordOp(ctx, sceneId, 'rename_node', { nodeId, nodeType, name }, ['nodeId'])
}

/** The parts of the renderer dialog's options an op can carry. */
interface RendererChoice {
  rendererType: string
  rendererName: string
  selectionEnabled: boolean
  selection: string
  centerView?: boolean
  presetName?: string
}

/**
 * A new renderer from the New Renderer dialog: `create_renderer`, or
 * `create_preset_renderer` for a preset (a group of renderers a style makes).
 */
export function recordCreateRenderer(
  ctx: WorkerContext,
  sceneId: number,
  objId: number,
  opts: RendererChoice,
  created: { rendId: number; groupName?: string },
): void {
  const centerView = opts.centerView === true ? true : null
  if (opts.presetName) {
    recordOp(ctx, sceneId, 'create_preset_renderer', { objId, preset: opts.presetName, name: opts.rendererName, centerView }, ['objId'])
    return
  }
  recordOp(
    ctx,
    sceneId,
    'create_renderer',
    {
      objId,
      rendererType: opts.rendererType,
      name: opts.rendererName || null,
      selection: opts.selectionEnabled ? opts.selection : null,
      centerView,
    },
    ['objId'],
  )
  if (created.groupName) {
    recordPropWrite(ctx, sceneId, { nodeType: 'renderer', nodeId: created.rendId, propName: 'group', op: 'set', value: created.groupName })
  }
}

/** A renderer redrawn as another type. Call before the old one goes. */
export function recordChangeRendererType(ctx: WorkerContext, sceneId: number, rendId: number, rendererType: string): void {
  recordOp(ctx, sceneId, 'set_renderer_type', { rendId, rendererType }, ['rendId'])
}

/** A value the dialog may leave empty, as the op's null. */
function orNull(text: string): string | null {
  return text !== '' ? text : null
}

/** The format load op that reads a file with these options, and those options as its arguments. */
function formatLoad(format: FormatOptions): [string, Record<string, unknown>] {
  switch (format.kind) {
    case 'pdb':
    case 'mmcif':
      return ['load_pdb', { ...format.options }]
    case 'mtz': {
      const o = format.options
      return ['load_mtz', {
        columnF: orNull(o.columnF),
        // An empty column turns the column off, as the dialog's checkbox does.
        columnPhi: o.phaseEnabled ? o.columnPhi : '',
        columnWeight: o.weightEnabled ? o.columnW : '',
        resolutionLimit: o.resolutionLimit,
        gridSpacing: o.gridSpacing,
      }]
    }
    case 'ccp4map': {
      const o = format.options
      return ['load_ccp4', {
        normalize: o.normalize,
        truncateMin: o.truncateMinEnabled ? o.truncateMin : null,
        truncateMax: o.truncateMaxEnabled ? o.truncateMax : null,
        mapType: o.mapType,
        subsample: o.subsample,
      }]
    }
    case 'msms':
      return ['load_msms', { vertFile: orNull(format.options.vertFilePath) }]
    case 'namdcoor':
      return ['load_namd', { psfFile: format.options.psfFilePath }]
    case 'amberprm':
      return ['load_amber', { coordFile: orNull(format.options.coordFilePath) }]
    default:
      return ['load_file', {}]
  }
}

/**
 * A file opened from the File Open dialog: the format's own load op with
 * the options the dialog read it with, and the renderer it is first drawn with.
 */
export function recordLoadFile(ctx: WorkerContext, sceneId: number, filePath: string, options: FileOpenOptions): void {
  const r = options.renderer
  const [op, formatArgs] = formatLoad(options.format)
  recordOp(ctx, sceneId, op, {
    path: filePath,
    rendererType: r.presetName ? null : r.rendererType || null,
    selection: r.selectionEnabled ? r.selection : null,
    name: r.objectName || null,
    rendererName: r.presetName || !r.rendererName ? null : r.rendererName,
    preset: r.presetName ? r.presetName : null,
    // The ops' defaults: the view centres on it, and a map follows its kind.
    centerView: r.centerView ? null : false,
    mapCenterPolicy: r.mapCenterPolicy !== 'auto' ? r.mapCenterPolicy : null,
    ...formatArgs,
  })
}
