/**
 * @file plugins/agent/worker/tools/sceneTools.ts
 * @description Tools that read or change what the scene shows.
 */

import { setNodeVisible } from '@renderer/worker/server/services/sceneTree/sceneTree'
import type { SceneNodeType } from '@renderer/worker/shared/sceneTreeTypes'
import { buildSceneSnapshot } from '../sceneSnapshot'
import { normalizeServiceResult } from '../toolOutput'
import type { AgentTool } from './types'
import { bool, enumStr, int, strictSchema } from './types'

const getSceneState: AgentTool = {
  name: 'get_scene_state',
  description:
    'List the objects in the scene, their renderers, and the named selections available. ' +
    'Every id you use in another tool must come from here or from a tool result. ' +
    'Call it again after loading a file or creating a renderer, since ids are assigned then.',
  parameters: strictSchema({}),
  mutates: false,
  run(ctx, _input, turn) {
    return {
      ok: true,
      data: buildSceneSnapshot(ctx, { sceneId: turn.sceneId, viewId: turn.viewId }),
    }
  },
}

const setVisible: AgentTool = {
  name: 'set_visible',
  description:
    'Show or hide one object, renderer, or renderer group. Hiding an object hides everything ' +
    'drawn from it. Use this rather than deleting something the user may want back.',
  parameters: strictSchema({
    nodeId: int('Uid of the object, renderer, or renderer group.'),
    nodeType: enumStr(
      ['object', 'renderer', 'rendGroup'],
      'What nodeId refers to. Must match what get_scene_state reported.',
    ),
    visible: bool('True to show, false to hide.'),
  }),
  mutates: true,
  run(ctx, input, turn) {
    const result = setNodeVisible(ctx, {
      sceneId: turn.sceneId,
      nodeId: Number(input.nodeId),
      nodeType: String(input.nodeType) as SceneNodeType,
      visible: Boolean(input.visible),
    })
    return normalizeServiceResult(result, 'No node with that id and type in this scene.')
  },
}

export const SCENE_TOOLS: AgentTool[] = [getSceneState, setVisible]
