/**
 * @file plugins/agent/worker/sceneSnapshot.ts
 * @description What is in the scene, compressed for a model to read.
 *
 * The model addresses everything by uid, and a uid is opaque: it cannot be
 * guessed from a name, and inventing one addresses either nothing or the
 * wrong thing. So every turn opens with a snapshot of what exists, and the
 * same shape is available as the `get_scene_state` tool for when the model
 * has changed something and wants to look again.
 *
 * Compressed deliberately. The full scene tree carries lock flags, UI collapse
 * hints, render order, camera and style roots -- none of which the model can
 * act on, all of which it would pay for.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import { getSceneTree } from '@renderer/worker/server/services/sceneTree/sceneTree'
import { getSelDefs } from '@renderer/worker/server/services/select/getSelDefs'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead'

/** Renderers listed per object before the tail is summarised away. */
const MAX_RENDERERS_PER_OBJECT = 40

export interface SnapshotRenderer {
  id: number
  name: string
  /** The renderer type, e.g. `cartoon`, `simple`, `*group`. */
  type: string
  visible: boolean
}

export interface SnapshotObject {
  id: number
  name: string
  /** The C++ class, e.g. `MolCoord`, `DensityMap`. */
  className: string
  visible: boolean
  renderers: SnapshotRenderer[]
  /** Stated only when some renderers were left out. */
  renderersOmitted?: number
}

/**
 * The scene's own settings, keyed by the property name that writes them back.
 *
 * A sample, not the whole list: the point is to show that the scene is a node
 * with settings of its own and to hand over the exact spelling of the keys,
 * so the model can reach for set_node_prop without a read first. The rest are
 * one get_node_props call away.
 */
export interface SnapshotSceneSettings {
  /** Background colour as `#rrggbb`, which is what `bgcolor` takes back. */
  bgcolor: string
  /** Whether ambient occlusion is on. */
  aoEnabled: boolean
  /** Post-process anti-aliasing method: `none`, `fxaa` or `smaa`. */
  aa_method: string
}

export interface SceneSnapshot {
  sceneId: number
  viewId: number
  /** Absent when the scene could not be read. */
  settings?: SnapshotSceneSettings
  objects: SnapshotObject[]
  /** Named selections usable in a selection expression. */
  namedSelections: string[]
}

/** `#rrggbb`, the form the colour compiler reads back. */
function hexOf(r: number, g: number, b: number): string {
  const pair = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${pair(r)}${pair(g)}${pair(b)}`
}

/**
 * The scene-wide settings, or undefined when the scene cannot be read.
 *
 * @remarks `aa_method` is declared `enum` in Scene.qif, so the generated
 *   wrapper types it as a number while C++ hands back the string id.
 */
function readSceneSettings(
  ctx: WorkerContext,
  sceneId: number,
): SnapshotSceneSettings | undefined {
  const scene = getSceneOrNull(ctx, sceneId)
  if (!scene) return undefined
  const bg = safeRead(() => scene.bgcolor)
  return {
    bgcolor: bg ? hexOf(bg.r(), bg.g(), bg.b()) : '#000000',
    aoEnabled: safeRead(() => scene.aoEnabled) ?? false,
    aa_method: String(safeRead(() => scene.aa_method) ?? 'fxaa'),
  }
}

/** Flatten a renderer subtree; a group contributes itself and its children. */
function flattenRenderers(nodes: SceneTreeNode[]): SnapshotRenderer[] {
  const out: SnapshotRenderer[] = []
  for (const node of nodes) {
    if (node.type !== 'renderer' && node.type !== 'rendGroup') continue
    out.push({ id: node.id, name: node.name, type: node.className, visible: node.visible })
    if (node.children.length > 0) out.push(...flattenRenderers(node.children))
  }
  return out
}

/**
 * The scene as the model sees it.
 *
 * @remarks Returns an empty object list rather than failing when the scene
 *   cannot be read: an agent turn on an empty scene is a legitimate way to
 *   start (`fetch_pdb` then build), and a hard failure there would read to
 *   the model as "the scene is broken".
 */
export function buildSceneSnapshot(
  ctx: WorkerContext,
  args: { sceneId: number; viewId: number },
): SceneSnapshot {
  const tree = getSceneTree(ctx, { sceneId: args.sceneId })
  const objects: SnapshotObject[] = []

  for (const node of tree.tree?.children ?? []) {
    if (node.type !== 'object') continue
    const all = flattenRenderers(node.children)
    const shown = all.slice(0, MAX_RENDERERS_PER_OBJECT)
    const obj: SnapshotObject = {
      id: node.id,
      name: node.name,
      className: node.className,
      visible: node.visible,
      renderers: shown,
    }
    if (all.length > shown.length) obj.renderersOmitted = all.length - shown.length
    objects.push(obj)
  }

  const defs = getSelDefs(ctx, { sceneId: args.sceneId })

  const settings = readSceneSettings(ctx, args.sceneId)

  return {
    sceneId: args.sceneId,
    viewId: args.viewId,
    ...(settings ? { settings } : {}),
    objects,
    namedSelections: [...defs.global, ...defs.scene],
  }
}

/**
 * The snapshot as it is prepended to the user's message.
 *
 * Tagged rather than free prose so the model can tell the scene description
 * from what the user actually typed.
 */
export function formatSceneSnapshot(snapshot: SceneSnapshot): string {
  return `<scene_state>\n${JSON.stringify(snapshot)}\n</scene_state>`
}
