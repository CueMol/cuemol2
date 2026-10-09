/**
 * @file renderer/plugin-host/sceneTabOps.ts
 * @description The scene (tab) commands, carried out on the tab strip:
 * list, create, switch to and close a scene.
 *
 * The console and MCP both offer these, and a scene is a tab, so they run in
 * the window rather than as worker ops. Both front ends call these and only
 * format the answer: lines for the console, JSON for MCP. Nothing prompts --
 * either may be driven with nobody at the window -- so a scene with unsaved
 * changes is closed only when the caller says to discard them.
 */

import { findBySpec } from '@renderer/worker/shared/numbered'
import type { OpenScene, SceneTabs } from './sceneTabs'

export type SceneTabResult<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Which scene a call names: text (its number in list_scenes, `#uid` or
 * name, as typed at the console), a sceneId (as MCP passes it), or null / ''
 * for the active one.
 */
export type SceneSpec = string | number | null

/** A scene, with its number in list_scenes. */
export interface NumberedScene extends OpenScene {
  number: number
}

/** The scene `spec` names in `list`, or why none. */
export function resolveScene(list: readonly OpenScene[], spec: SceneSpec): NumberedScene | string {
  if (list.length === 0) return 'No scene is open.'
  let scene: OpenScene | string
  if (spec === null || spec === '') scene = list.find((s) => s.active) ?? 'No scene is active.'
  else if (typeof spec === 'number') scene = list.find((s) => s.sceneId === spec) ?? `No open scene has sceneId ${spec}; call list_scenes.`
  else scene = findBySpec(list, spec, { uid: (s) => s.sceneId, name: (s) => s.name, noun: 'scene', listCmd: 'list_scenes' })
  return typeof scene === 'string' ? scene : { ...scene, number: list.indexOf(scene) + 1 }
}

/** The open scenes in tab order, numbered from 1. */
export async function listScenes(tabs: SceneTabs): Promise<NumberedScene[]> {
  return (await tabs.list()).map((s, i) => ({ ...s, number: i + 1 }))
}

/** Open a new empty scene in a tab of its own and make it active. */
export async function createScene(tabs: SceneTabs, name: string | null): Promise<SceneTabResult<{ sceneId: number; name: string }>> {
  const made = await tabs.create(name || undefined)
  return made ? { ok: true, data: made } : { ok: false, error: 'The scene could not be made.' }
}

/** Make the scene `spec` names the active one. */
export async function switchScene(tabs: SceneTabs, spec: SceneSpec): Promise<SceneTabResult<NumberedScene>> {
  const scene = resolveScene(await tabs.list(), spec)
  if (typeof scene === 'string') return { ok: false, error: scene }
  await tabs.activate(scene.sceneId)
  return { ok: true, data: { ...scene, active: true } }
}

/** Close the scene `spec` names and its tabs; refused when it has unsaved changes and `discardChanges` is not set. */
export async function closeScene(
  tabs: SceneTabs,
  spec: SceneSpec,
  discardChanges: boolean,
): Promise<SceneTabResult<NumberedScene>> {
  const scene = resolveScene(await tabs.list(), spec)
  if (typeof scene === 'string') return { ok: false, error: scene }
  if (scene.modified && !discardChanges) {
    return {
      ok: false,
      error: `Scene ${scene.number} (${scene.name}) has unsaved changes. Save it with save_scene, or close it with discardChanges true.`,
    }
  }
  if (!(await tabs.close(scene.sceneId))) return { ok: false, error: `Scene ${scene.name} could not be closed.` }
  return { ok: true, data: scene }
}
