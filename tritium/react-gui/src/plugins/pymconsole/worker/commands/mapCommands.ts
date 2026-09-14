/**
 * @file plugins/pymconsole/worker/commands/mapCommands.ts
 * @description `isomesh`, `isosurface` and `isolevel`.
 *
 * In PyMOL an isomesh is an object of its own, made from a map and carrying
 * the contour level. In CueMol it is a renderer on the map object, which is
 * the same thing seen from one level down: `isomesh msh, 2fofc` gives the
 * map object a `contour` renderer named `msh`, and `isolevel msh, 2.0` finds
 * that renderer by name and moves its level.
 *
 * Two differences are worth knowing rather than hiding. The region drawn is
 * a box around the renderer's own centre, not a selection with a buffer, so
 * `selection` and `carve` are refused rather than approximated; a fresh
 * renderer's centre is put on the view so the box lands where the user is
 * looking, as the file-open path does. And the level is `siglevel`, whose
 * unit is the map's: sigma multiples on a crystallographic map, top percent
 * of grid points on a cryo-EM one.
 */

import { getNewRendererOptions } from '@renderer/worker/server/services/rend/getNewRendererOptions'
import { createRendererOnObject } from '@renderer/worker/server/services/rend/createRendererOnObject'
import { applyMapCenterPolicy } from '@renderer/worker/server/services/map/emDefaults'
import { listMapRenderers } from '@renderer/worker/server/services/map/renderers'
import { getMapRendererState } from '@renderer/worker/server/services/map/state'
import { setMapRendererProp } from '@renderer/worker/server/services/map/props'
import type { MapRendererEntry } from '@renderer/worker/server/services/map/types'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { isDefaulted, resolveObjects, toNumber } from './helpers'

/** PyMOL's two mesh commands, as the CueMol renderer type each becomes. */
const MESH_TYPES = {
  isomesh: 'contour',
  isosurface: 'isosurf',
} as const

/** Set a map renderer's contour level, in the map's own unit. */
function writeLevel(ctx: WorkerContext, sceneId: number, rendId: number, level: number): boolean {
  return setMapRendererProp(ctx, {
    sceneId,
    rendId,
    propName: 'siglevel',
    value: level,
    mode: 'commit',
  }).ok
}

/**
 * Put a freshly made map renderer's box on the view.
 *
 * A new renderer has its centre at the origin, which for a crystallographic
 * map is nowhere near the model, so without this the command appears to draw
 * nothing. Same call the file-open path makes, with the policy it uses for a
 * map the user is adding to a scene they are already looking at.
 */
function centreOnView(ctx: WorkerContext, sceneId: number, objId: number, rendId: number): void {
  const scene = getSceneOrNull(ctx, sceneId)
  if (!scene) return
  const obj = scene.getObject(objId)
  const rend = scene.getRenderer(rendId)
  if (!obj || !rend) return
  applyMapCenterPolicy(scene, obj, rend, 'setMapCenter')
}

/** The map object `pattern` names, or a reason it named nothing usable. */
function resolveMap(
  ctx: WorkerContext,
  cc: CmdContext,
  pattern: string,
  rendererType: string,
): { ok: true; objId: number; name: string } | (CmdOutcome & { ok: false }) {
  const want = pattern.trim()
  if (want === '') return { ok: false, error: 'Error: no map object given' }
  const hits = resolveObjects(ctx, cc.sceneId, want)
  if (hits.length === 0) return { ok: false, error: `Error: no object named "${want}"` }
  for (const obj of hits) {
    // Whether the object can carry the renderer is the only reliable test
    // that it is a map: the class name varies by what was loaded.
    const options = getNewRendererOptions(ctx, {
      sceneId: cc.sceneId,
      sourceNodeId: obj.uid,
      sourceNodeType: 'object',
    })
    if (options.ok && options.rendererTypes.includes(rendererType)) {
      return { ok: true, objId: obj.uid, name: obj.name }
    }
  }
  return { ok: false, error: `Error: "${want}" is not a density map` }
}

/** Every map renderer in the scene called `name`. */
function renderersNamed(ctx: WorkerContext, sceneId: number, name: string): MapRendererEntry[] {
  return listMapRenderers(ctx, { sceneId }).items.filter((r) => r.rendName === name)
}

/** `isomesh` / `isosurface`, which differ only in the renderer type. */
function meshCommand(name: 'isomesh' | 'isosurface'): PymCommand {
  const rendererType = MESH_TYPES[name]
  return {
    name,
    params: [
      { name: 'name' },
      { name: 'map' },
      { name: 'level', default: '1.0' },
      { name: 'selection', default: '' },
      { name: 'buffer', default: '0.0' },
      { name: 'state', default: '1' },
      { name: 'carve', default: '' },
      { name: 'source_state', default: '0' },
      { name: 'quiet', default: '1' },
    ],
    mode: 'legacy',
    mutates: true,
    summary:
      name === 'isomesh'
        ? 'Contour a density map as a mesh.'
        : 'Contour a density map as a solid surface.',
    completions: [null, { source: 'objects', description: 'object', suffix: ', ' }],
    run(ctx, args, cc) {
      for (const [arg, def, why] of [
        ['selection', '', 'the region follows the view, not a selection'],
        ['buffer', '0.0', 'the region size is the renderer extent'],
        ['carve', '', 'not supported'],
        ['state', '1', 'not supported'],
        ['source_state', '0', 'not supported'],
      ] as const) {
        if (!isDefaulted(args[arg], def)) cc.warn(`${name}: ${arg} is ignored (${why})`)
      }

      const rendName = args.name.trim()
      if (rendName === '') return { ok: false, error: `Error: ${name} needs a name` }
      const level = toNumber(args.level)
      if (level === null) return { ok: false, error: `Error: "${args.level}" is not a level` }

      const map = resolveMap(ctx, cc, args.map, rendererType)
      if (!map.ok) return map

      // PyMOL's isomesh onto an existing name replaces it. Here the renderer
      // is already the right shape, so it is re-levelled rather than remade --
      // which also keeps whatever colouring the user gave it.
      const existing = renderersNamed(ctx, cc.sceneId, rendName).filter(
        (r) => r.objId === map.objId && r.type === rendererType,
      )
      if (existing.length > 0) {
        if (!writeLevel(ctx, cc.sceneId, existing[0].rendId, level)) {
          return { ok: false, error: `Error: could not set the level of "${rendName}"` }
        }
        cc.print(` ${name}: "${rendName}" at ${level}`)
        return { ok: true }
      }

      const created = createRendererOnObject(ctx, {
        sceneId: cc.sceneId,
        objId: map.objId,
        rendOpts: {
          objectName: map.name,
          rendererType,
          rendererName: rendName,
          selectionEnabled: false,
          selection: '',
          centerView: false,
          mapCenterPolicy: 'setMapCenter',
        },
      })
      if (!created.ok || created.newRendId === undefined) {
        return { ok: false, error: `Error: could not contour "${map.name}"` }
      }
      centreOnView(ctx, cc.sceneId, map.objId, created.newRendId)
      if (!writeLevel(ctx, cc.sceneId, created.newRendId, level)) {
        return { ok: false, error: `Error: could not set the level of "${rendName}"` }
      }
      cc.print(` ${name}: "${rendName}" on "${map.name}" at ${level}`)
      return { ok: true }
    },
  }
}

const isolevel: PymCommand = {
  name: 'isolevel',
  params: [
    { name: 'name' },
    { name: 'level', default: '1.0' },
    { name: 'state', default: '1' },
    { name: 'query', default: '0' },
    { name: 'quiet', default: '1' },
  ],
  mode: 'legacy',
  mutates: true,
  summary: 'Change the contour level of a map renderer, or read it back.',
  completions: [{ source: 'mapRenderers', description: 'map renderer', suffix: ', ' }],
  run(ctx, args, cc) {
    if (!isDefaulted(args.state, '1')) cc.warn('isolevel: state is ignored (not supported)')

    const rendName = args.name.trim()
    if (rendName === '') return { ok: false, error: 'Error: isolevel needs a renderer name' }
    const found = renderersNamed(ctx, cc.sceneId, rendName)
    if (found.length === 0) {
      return { ok: false, error: `Error: no map renderer named "${rendName}"` }
    }

    // `query=1` reads the level instead of writing it, as PyMOL's does.
    if (!isDefaulted(args.query, '0')) {
      for (const rend of found) {
        const state = getMapRendererState(ctx, { sceneId: cc.sceneId, rendId: rend.rendId }).state
        if (state === null) continue
        cc.print(` isolevel: ${rend.objName}/${rend.rendName} at ${state.siglevel}`)
      }
      return { ok: true }
    }

    const level = toNumber(args.level)
    if (level === null) return { ok: false, error: `Error: "${args.level}" is not a level` }
    for (const rend of found) {
      if (!writeLevel(ctx, cc.sceneId, rend.rendId, level)) {
        return { ok: false, error: `Error: could not set the level of "${rendName}"` }
      }
    }
    return { ok: true }
  },
}

/** The names of the scene's map renderers, for completion. */
export function mapRendererNames(ctx: WorkerContext, sceneId: number): string[] {
  return [
    ...new Set(
      listMapRenderers(ctx, { sceneId })
        .items.map((r) => r.rendName)
        .filter((n) => n !== ''),
    ),
  ]
}

export const MAP_COMMANDS: PymCommand[] = [
  meshCommand('isomesh'),
  meshCommand('isosurface'),
  isolevel,
]
