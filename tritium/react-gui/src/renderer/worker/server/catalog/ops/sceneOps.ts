/**
 * @file worker/server/catalog/ops/sceneOps.ts
 * @description Ops that read or change what the scene shows.
 */

import { setNodeVisible } from '@renderer/worker/server/services/sceneTree/sceneTree'
import { deleteNode as deleteNodeService, renameNode as renameNodeService } from '@renderer/worker/server/services/sceneTree/sceneOps'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import { boolean, enumOf, nodeId, string } from '../params'
import { columns, wrapList } from '../consoleFormat'
import { buildSceneSnapshot } from './sceneSnapshot'
import type { SceneSnapshot } from './sceneSnapshot'

export const getSceneState = defineOp({
  name: 'get_scene_state',
  description:
    'List the objects in the scene, their renderers, and the named selections available. ' +
    'Every id you use in another tool must come from here or from a tool result. ' +
    'Call it again after loading a file or creating a renderer, since ids are assigned then.',
  params: {},
  mutates: false,
  expose: { tool: 'core', console: true },
  group: 'nodes',
  aliases: [{ name: 'scene', summary: 'List the objects, renderers and selections in the scene.' }],
  format: (data) => formatSnapshot(data as SceneSnapshot),
  run(ctx, _args, oc) {
    return {
      ok: true,
      data: buildSceneSnapshot(ctx, { sceneId: oc.sceneId, viewId: oc.viewId }),
    }
  },
})

/**
 * The scene as a tree a person reads: each object, its renderers under it,
 * with the uid to address it by and whether it is hidden.
 */
function formatSnapshot(s: SceneSnapshot): string[] {
  const out: string[] = []
  if (s.settings) {
    const st = s.settings
    out.push(`scene: bgcolor ${st.bgcolor}, AO ${st.aoEnabled ? 'on' : 'off'}, AA ${st.aa_method}`)
  }
  if (s.objects.length === 0) out.push('(no objects)')
  const rows: string[][] = []
  for (const o of s.objects) {
    rows.push([o.name, `#${o.id}`, o.className, o.visible ? '' : '(hidden)'])
    for (const r of o.renderers) {
      rows.push([`  ${o.name}/${r.name}`, `#${r.id}`, r.type, r.visible ? '' : '(hidden)'])
    }
    if (o.renderersOmitted) rows.push([`  ... ${o.renderersOmitted} more renderers`, '', '', ''])
  }
  out.push(...columns(rows))
  if (s.namedSelections.length > 0) out.push('selections:', ...wrapList(s.namedSelections, '  '))
  return out
}

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
  group: 'nodes',
  aliases: [
    { name: 'show', fixed: { visible: true }, summary: 'Show an object, renderer or renderer group.' },
    { name: 'hide', fixed: { visible: false }, summary: 'Hide an object, renderer or renderer group.' },
  ],
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

/** The node kinds the tree edits address. */
const TREE_NODE_TYPES = ['object', 'renderer', 'rendGroup'] as const

export const deleteNode = defineOp({
  name: 'delete_node',
  description:
    'Delete one object, renderer, or renderer group from the scene. Deleting an object deletes ' +
    'everything drawn from it; deleting a group deletes its renderers. Only when the user asked ' +
    'to remove it: to take something out of view, hide it with set_visible instead.',
  params: {
    nodeId: nodeId('Uid of the object, renderer, or renderer group.', 'nodeType'),
    nodeType: enumOf(TREE_NODE_TYPES, 'What nodeId refers to. Must match what get_scene_state reported.'),
  },
  mutates: true,
  expose: { tool: 'core', console: true },
  group: 'nodes',
  aliases: [{ name: 'delete', summary: 'Delete an object, renderer or renderer group.' }],
  run(ctx, args, oc) {
    const result = deleteNodeService(ctx, { sceneId: oc.sceneId, nodeId: args.nodeId, nodeType: args.nodeType })
    return normalizeServiceResult(result, 'No node with that id and type in this scene.')
  },
})

export const renameNode = defineOp({
  name: 'rename_node',
  description:
    'Rename one object, renderer, or renderer group. Renaming a group keeps its renderers in it.',
  params: {
    nodeId: nodeId('Uid of the object, renderer, or renderer group.', 'nodeType'),
    nodeType: enumOf(TREE_NODE_TYPES, 'What nodeId refers to. Must match what get_scene_state reported.'),
    name: string('The new name. Not empty; a renderer group name must be unused in the scene.'),
  },
  mutates: true,
  expose: { tool: 'core', console: true },
  group: 'nodes',
  aliases: [{ name: 'rename', summary: 'Rename an object, renderer or renderer group: rename 1crn, mol1' }],
  run(ctx, args, oc) {
    const result = renameNodeService(ctx, {
      sceneId: oc.sceneId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      newName: args.name,
    })
    return normalizeServiceResult(
      result,
      'The node could not be renamed. Check the id and type, and that the name is not empty ' +
        '(or, for a group, not already used).',
    )
  },
})

export const SCENE_OPS = [getSceneState, setVisible, deleteNode, renameNode]
