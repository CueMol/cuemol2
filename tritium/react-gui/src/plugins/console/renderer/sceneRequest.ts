/**
 * @file plugins/console/renderer/sceneRequest.ts
 * @description Doing what a scene command asked for (`scenes`, `new_scene`,
 * `switch_scene`, `close_scene`), on the tab strip.
 *
 * The worker parsed the command; everything it means happens here, because
 * a scene is a tab. Nothing prompts: the console may be driven from a
 * terminal with nobody looking at the window, so a scene with unsaved
 * changes is closed only when `force` says so.
 */

import type { OpenScene, SceneTabs } from '@renderer/plugin-host/api'
import type { SceneRequest } from '../shared/consoleTypes'

/** The lines to print, or why it could not be done. */
export type SceneRequestOutcome = { ok: true; lines: string[] } | { ok: false; error: string }

/** One `scenes` line: `* 2  name  #uid  (2 views, modified)`. */
function describe(scene: OpenScene, index: number): string {
  const notes = [
    ...(scene.viewIds.length > 1 ? [`${scene.viewIds.length} views`] : []),
    ...(scene.modified ? ['modified'] : []),
  ]
  const tail = notes.length > 0 ? `  (${notes.join(', ')})` : ''
  return `${scene.active ? '*' : ' '} ${index + 1}  ${scene.name}  #${scene.sceneId}${tail}`
}

/**
 * The scene `spec` names: a number from `scenes` (1-based), `#uid`, or a
 * name. Empty is the active scene.
 */
export function findScene(list: readonly OpenScene[], spec: string): OpenScene | string {
  if (list.length === 0) return 'Error: no scene is open'
  if (spec === '') return list.find((s) => s.active) ?? 'Error: no scene is active'
  const uid = /^#(\d+)$/.exec(spec)
  if (uid) return list.find((s) => s.sceneId === Number(uid[1])) ?? `Error: no open scene has uid ${spec}`
  if (/^\d+$/.test(spec)) {
    return list[Number(spec) - 1] ?? `Error: no scene ${spec}; "scenes" lists 1 to ${list.length}`
  }
  const named = list.filter((s) => s.name === spec)
  if (named.length === 1) return named[0]
  if (named.length > 1) return `Error: ${named.length} scenes are named "${spec}"; give its number or #uid`
  return `Error: no open scene is named "${spec}"`
}

export async function doSceneRequest(tabs: SceneTabs, req: SceneRequest): Promise<SceneRequestOutcome> {
  if (req.op === 'new') {
    const made = await tabs.create(req.name || undefined)
    if (!made) return { ok: false, error: 'Error: the scene could not be made' }
    return { ok: true, lines: [`new scene ${made.name}  #${made.sceneId}`] }
  }

  const list = await tabs.list()
  if (req.op === 'list') {
    if (list.length === 0) return { ok: true, lines: ['no scene is open'] }
    return { ok: true, lines: list.map(describe) }
  }

  const scene = findScene(list, req.scene)
  if (typeof scene === 'string') return { ok: false, error: scene }
  const index = list.indexOf(scene)

  if (req.op === 'switch') {
    await tabs.activate(scene.sceneId)
    return { ok: true, lines: [describe({ ...scene, active: true }, index)] }
  }

  if (scene.modified && !req.force) {
    return {
      ok: false,
      error: `Error: ${scene.name} has unsaved changes; save it, or close it with "close_scene ${index + 1}, force"`,
    }
  }
  if (!(await tabs.close(scene.sceneId))) return { ok: false, error: `Error: ${scene.name} could not be closed` }
  return { ok: true, lines: [`closed ${scene.name}`] }
}
