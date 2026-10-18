/**
 * @file plugins/console/renderer/sceneRequest.ts
 * @description Doing what a scene command asked for (`list_scenes`, `create_scene`,
 * `switch_scene`, `close_scene`), on the tab strip.
 *
 * The worker parsed the command; the plugin host's scene tab operations do
 * it, the same ones MCP's scene tools use. This only turns their answers
 * into lines.
 */

import { closeScene, createScene, listScenes, switchScene } from '@renderer/plugin-host/api'
import type { NumberedScene, SceneTabs } from '@renderer/plugin-host/api'
import type { SceneRequest } from '../shared/consoleTypes'

/** The lines to print, or why it could not be done. */
export type SceneRequestOutcome = { ok: true; lines: string[] } | { ok: false; error: string }

/** One `list_scenes` line: `* 2  name  #uid  (2 views, modified)`. */
function describe(scene: NumberedScene): string {
  const notes = [
    ...(scene.viewIds.length > 1 ? [`${scene.viewIds.length} views`] : []),
    ...(scene.modified ? ['modified'] : []),
  ]
  const tail = notes.length > 0 ? `  (${notes.join(', ')})` : ''
  return `${scene.active ? '*' : ' '} ${scene.number}  ${scene.name}  #${scene.sceneId}${tail}`
}

/** Do a scene command on the tab strip (`quit` is runSubmission's, not a tab's). */
export async function doSceneRequest(
  tabs: SceneTabs,
  req: Exclude<SceneRequest, { op: 'quit' }>,
): Promise<SceneRequestOutcome> {
  switch (req.op) {
    case 'list': {
      const list = await listScenes(tabs)
      return { ok: true, lines: list.length === 0 ? ['no scene is open'] : list.map(describe) }
    }
    case 'new': {
      const made = await createScene(tabs, req.name)
      return made.ok ? { ok: true, lines: [`new scene ${made.data.name}  #${made.data.sceneId}`] } : { ok: false, error: `Error: ${made.error}` }
    }
    case 'switch': {
      const res = await switchScene(tabs, req.scene)
      return res.ok ? { ok: true, lines: [describe(res.data)] } : { ok: false, error: `Error: ${res.error}` }
    }
    case 'close': {
      const res = await closeScene(tabs, req.scene, req.discardChanges)
      return res.ok ? { ok: true, lines: [`closed ${res.data.name}`] } : { ok: false, error: `Error: ${res.error}` }
    }
  }
}
