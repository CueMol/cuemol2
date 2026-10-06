/**
 * @file worker/server/catalog/ops/sceneOps.ts
 * @description Ops that read or change what the scene shows.
 */

import { setNodeVisible } from '@renderer/worker/server/services/sceneTree/sceneTree'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import { boolean, enumOf, nodeId } from '../params'
import { buildSceneSnapshot } from './sceneSnapshot'

export const getSceneState = defineOp({
  name: 'get_scene_state',
  description:
    'List the objects in the scene, their renderers, and the named selections available. ' +
    'Every id you use in another tool must come from here or from a tool result. ' +
    'Call it again after loading a file or creating a renderer, since ids are assigned then.',
  params: {},
  mutates: false,
  expose: { tool: 'core', console: true },
  run(ctx, _args, oc) {
    return {
      ok: true,
      data: buildSceneSnapshot(ctx, { sceneId: oc.sceneId, viewId: oc.viewId }),
    }
  },
})

export const setVisible = defineOp({
  name: 'set_visible',
  description:
    'Show or hide one object, renderer, or renderer group. Hiding an object hides everything ' +
    'drawn from it. Use this rather than deleting something the user may want back.',
  params: {
    nodeId: nodeId('Uid of the object, renderer, or renderer group.', 'nodeType'),
    nodeType: enumOf(
      ['object', 'renderer', 'rendGroup'],
      'What nodeId refers to. Must match what get_scene_state reported.',
    ),
    visible: boolean('True to show, false to hide.'),
  },
  mutates: true,
  expose: { tool: 'core', console: true },
  run(ctx, args, oc) {
    const result = setNodeVisible(ctx, {
      sceneId: oc.sceneId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      visible: args.visible,
    })
    return normalizeServiceResult(result, 'No node with that id and type in this scene.')
  },
})

export const SCENE_OPS = [getSceneState, setVisible]
