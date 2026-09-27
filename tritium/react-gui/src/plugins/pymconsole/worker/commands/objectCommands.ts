/**
 * @file plugins/pymconsole/worker/commands/objectCommands.ts
 * @description Showing, hiding and listing whole objects.
 *
 * PyMOL's `enable` / `disable` toggle an object's visibility, which is what
 * CueMol's scene tree calls a node's `visible` flag. The representation-level
 * `show` / `hide` are a different thing (they take a selection) and are not
 * part of this phase.
 */

import { getSceneTree, setNodeVisible } from '@renderer/worker/server/services/sceneTree/sceneTree'
import { getSelDefs } from '@renderer/worker/server/services/select/getSelDefs'
import type { PymCommand } from './types'
import { formatNameList, isDefaulted, resolveObjects, resolveRenderers, toBoolean } from './helpers'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { matchNamedSelections, showNamedSelection } from './namedSelections'

/** Build `enable` and `disable` from the one thing that differs. */
function visibilityCommand(name: string, visible: boolean): PymCommand {
  return {
    name,
    params: [
      { name: 'name', default: 'all' },
      ...(visible ? [{ name: 'parents', default: '0' }] : []),
    ],
    mode: 'strict',
    mutates: true,
    summary: visible
      ? 'Show objects or renderers, or show a named selection.'
      : 'Hide objects or renderers, or hide a named selection.',
    completions: [{ source: 'objects', description: 'object', suffix: ' ' }],
    run(ctx, args, cc) {
      if (visible && !isDefaulted(args.parents, '0')) {
        cc.warn(`${name}: parents is ignored (not supported)`)
      }
      const hits = resolveObjects(ctx, cc.sceneId, args.name)
      if (hits.length === 0) {
        // A renderer by name (an isomesh, a distance), as delete takes it,
        // then a named selection, whose atoms PyMOL shows or hides.
        const rends = resolveRenderers(ctx, cc.sceneId, args.name)
        for (const rend of rends) {
          setNodeVisible(ctx, { sceneId: cc.sceneId, nodeId: rend.rendId, nodeType: 'renderer', visible })
        }
        if (rends.length > 0) return { ok: true }
        const sels = matchNamedSelections(ctx, cc.sceneId, args.name)
        for (const sel of sels) showNamedSelection(ctx, cc.sceneId, sel, visible)
        if (sels.length > 0) return { ok: true }
        return { ok: false, error: `Error: nothing named "${args.name}" in the scene` }
      }
      for (const obj of hits) {
        const res = setNodeVisible(ctx, {
          sceneId: cc.sceneId,
          nodeId: obj.uid,
          nodeType: 'object',
          visible,
        })
        if (!res.ok) return { ok: false, error: `Error: could not ${name} "${obj.name}"` }
      }
      return { ok: true }
    },
  }
}

/** The uids of the objects the scene tree shows as hidden. */
function hiddenObjectIds(ctx: WorkerContext, sceneId: number): Set<number> {
  const tree = getSceneTree(ctx, { sceneId })
  if (!tree.ok || !tree.tree) return new Set()
  return new Set(tree.tree.children.filter((c) => c.type === 'object' && !c.visible).map((c) => c.id))
}

/** PyMOL's `get_names` types, as what this console can answer with. */
const OBJECT_TYPES = new Set([
  'objects',
  'public_objects',
  'nongroup_objects',
  'public_nongroup_objects',
])
const SELECTION_TYPES = new Set(['selections', 'public_selections'])
const BOTH_TYPES = new Set(['all', 'public'])

const getNames: PymCommand = {
  name: 'get_names',
  params: [
    { name: 'type', default: 'public_objects' },
    { name: 'enabled_only', default: '0' },
    { name: 'selection', default: '' },
  ],
  mode: 'strict',
  mutates: false,
  summary: 'List object and selection names.',
  run(ctx, args, cc) {
    const enabledOnly = toBoolean(args.enabled_only)
    if (enabledOnly === null) return { ok: false, error: `Error: enabled_only must be 0 or 1: "${args.enabled_only}"` }
    if (!isDefaulted(args.selection, '')) {
      cc.warn('get_names: selection is ignored (not supported)')
    }
    const type = args.type.trim()
    const wantObjects = OBJECT_TYPES.has(type) || BOTH_TYPES.has(type)
    const wantSelections = SELECTION_TYPES.has(type) || BOTH_TYPES.has(type)
    if (!wantObjects && !wantSelections) {
      return { ok: false, error: `unknown type: '${type}'` }
    }
    const names: string[] = []
    if (wantObjects) {
      // Enabled is the object's own visible flag, which is what enable /
      // disable set. A named selection keeps no such state here, so
      // enabled_only leaves the selections as they are.
      const hidden = enabledOnly ? hiddenObjectIds(ctx, cc.sceneId) : new Set<number>()
      names.push(...resolveObjects(ctx, cc.sceneId, 'all').filter((o) => !hidden.has(o.uid)).map((o) => o.name))
    }
    if (wantSelections) {
      const defs = getSelDefs(ctx, { sceneId: cc.sceneId })
      names.push(...defs.scene)
    }
    cc.print(formatNameList(names))
    return { ok: true }
  },
}

export const OBJECT_COMMANDS: PymCommand[] = [
  visibilityCommand('enable', true),
  visibilityCommand('disable', false),
  getNames,
]
