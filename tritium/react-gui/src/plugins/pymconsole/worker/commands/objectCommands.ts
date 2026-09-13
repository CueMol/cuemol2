/**
 * @file plugins/pymconsole/worker/commands/objectCommands.ts
 * @description Showing, hiding and listing whole objects.
 *
 * PyMOL's `enable` / `disable` toggle an object's visibility, which is what
 * CueMol's scene tree calls a node's `visible` flag. The representation-level
 * `show` / `hide` are a different thing (they take a selection) and are not
 * part of this phase.
 */

import { setNodeVisible } from '@renderer/worker/server/services/sceneTree/sceneTree'
import { getSelDefs } from '@renderer/worker/server/services/select/getSelDefs'
import type { PymCommand } from './types'
import { formatNameList, isDefaulted, resolveObjects } from './helpers'

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
    summary: visible ? 'Show objects.' : 'Hide objects.',
    completions: [{ source: 'objects', description: 'object', suffix: ' ' }],
    run(ctx, args, cc) {
      if (visible && !isDefaulted(args.parents, '0')) {
        cc.warn(`${name}: parents is ignored (not supported)`)
      }
      const hits = resolveObjects(ctx, cc.sceneId, args.name)
      if (hits.length === 0) return { ok: false, error: `Error: object "${args.name}" not found` }
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
    if (!isDefaulted(args.enabled_only, '0')) {
      cc.warn('get_names: enabled_only is ignored (not supported)')
    }
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
      names.push(...resolveObjects(ctx, cc.sceneId, 'all').map((o) => o.name))
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
