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
 * `selection`, `carve` and `buffer` map onto the mol boundary every CueMol
 * map renderer has (C++ `MapRenderer`'s `bndry_molname` / `bndry_sel` /
 * `bndry_rng`), which does both of the jobs PyMOL splits between the latter
 * two. `getBndryBBox` fits the marched region to the selection's bounding
 * box grown by the range -- PyMOL's `buffer` -- and `inMolBndry` then drops
 * every grid point farther than the range from any selected atom -- PyMOL's
 * `carve`.
 *
 * One range, two PyMOL arguments, so `carve` wins when both are given and
 * `buffer` fills in when only it is. PyMOL does the same substitution the
 * other way round (`Executive.cpp`: `if (fbuf <= R_SMALL4) fbuf =
 * fabs(carve)`), for the same reason -- a box narrower than the carve
 * radius would cut the carved surface off at its faces. What cannot be
 * carried across is setting the two independently, which in PyMOL means a
 * box wider than the carving; here the corners come off at the same radius.
 *
 * The other difference is which molecule the selection runs against. PyMOL
 * selections span the scene and carve against every object they match;
 * `bndry_molname` names one molecule. This picks the one the expression
 * names, or the first in the scene, the way `zoom` and the measure commands
 * do -- and says so when the choice was not the user's.
 *
 * Without a selection the region is a box around the renderer's own centre,
 * which is put on the view when the renderer is made, as the file-open path
 * does; otherwise a fresh renderer contours around the origin and looks
 * like it drew nothing. And the level is `siglevel`, whose unit is the
 * map's: sigma multiples on a crystallographic map, top percent of grid
 * points on a cryo-EM one.
 */

import { getNewRendererOptions } from '@renderer/worker/server/services/rend/getNewRendererOptions'
import { createRendererOnObject } from '@renderer/worker/server/services/rend/createRendererOnObject'
import { applyMapCenterPolicy } from '@renderer/worker/server/services/map/emDefaults'
import { listMapRenderers } from '@renderer/worker/server/services/map/renderers'
import { getMapRendererState } from '@renderer/worker/server/services/map/state'
import { setMapRendererProp } from '@renderer/worker/server/services/map/props'
import type { MapRendererEntry } from '@renderer/worker/server/services/map/types'
import { setGenericProp } from '@renderer/worker/server/services/props/write'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { selectionNames, translateSelection } from '../sel/translate'
import type { CmdContext, CmdOutcome, PymCommand } from './types'
import { isDefaulted, molecules, resolveObjects, toNumber } from './helpers'

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

/**
 * A distance argument that may be absent.
 *
 * @returns the number, null when the argument was not given, or 'bad' when
 *   it was given and is not a number.
 */
function optionalLength(raw: string): number | null | 'bad' {
  if (raw.trim() === '') return null
  const n = toNumber(raw)
  return n === null ? 'bad' : n
}

/**
 * Point a map renderer's mol boundary at a selection: PyMOL's `carve`.
 *
 * `bndry_molname` is a molecule NAME rather than a uid (C++ resolves it by
 * name at every rebuild), and an empty name switches the boundary off, which
 * is how the region goes back to the plain box.
 */
function writeBoundary(
  ctx: WorkerContext,
  sceneId: number,
  rendId: number,
  molName: string,
  selStr: string,
  range: number | null,
): boolean {
  const write = (propName: string, value: string | number, valueType: string): boolean =>
    setGenericProp(ctx, {
      sceneId,
      nodeId: rendId,
      nodeType: 'renderer',
      propName,
      op: 'set',
      valueType,
      value,
      mode: 'commit',
    }).ok

  if (!write('bndry_molname', molName, 'string')) return false
  // The selection is compiled by the property bridge, as a renderer's own
  // `sel` is.
  if (!write('bndry_sel', selStr, 'object<MolSelection>')) return false
  if (range !== null && !write('bndry_rng', range, 'real')) return false
  return true
}

/**
 * The molecule a carve selection should run against.
 *
 * PyMOL evaluates a selection over the whole scene and carves against every
 * object it matches; `bndry_molname` takes one name. The expression's own
 * bare words are the user's answer when they gave one -- `isomesh m, map,
 * 1.0, 1crn and resi 50` clearly means 1crn -- and otherwise the first
 * molecule stands in, as it does for `zoom` and the measure commands.
 */
function boundaryMolecule(
  ctx: WorkerContext,
  cc: CmdContext,
  expr: string,
): { ok: true; name: string } | (CmdOutcome & { ok: false }) {
  const mols = molecules(ctx, cc.sceneId)
  if (mols.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }

  for (const word of selectionNames(expr)) {
    const named = mols.find((m) => m.name === word)
    if (named) return { ok: true, name: named.name }
  }
  if (mols.length > 1) {
    cc.warn(`carving against "${mols[0].name}" only: name a molecule in the selection to pick another`)
  }
  return { ok: true, name: mols[0].name }
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
    completions: [
      null,
      { source: 'objects', description: 'object', suffix: ', ' },
      null,
      { source: 'selections', description: 'selection', suffix: ', ' },
    ],
    run(ctx, args, cc) {
      for (const [arg, def] of [
        ['state', '1'],
        ['source_state', '0'],
      ] as const) {
        if (!isDefaulted(args[arg], def)) cc.warn(`${name}: ${arg} is ignored (not supported)`)
      }

      const rendName = args.name.trim()
      if (rendName === '') return { ok: false, error: `Error: ${name} needs a name` }
      const level = toNumber(args.level)
      if (level === null) return { ok: false, error: `Error: "${args.level}" is not a level` }

      const carve = optionalLength(args.carve)
      if (carve === 'bad') return { ok: false, error: `Error: "${args.carve}" is not a carve radius` }
      // PyMOL's buffer default is 0.0, which means "not given" there too.
      const buffer = args.buffer.trim() === '0.0' ? null : optionalLength(args.buffer)
      if (buffer === 'bad') return { ok: false, error: `Error: "${args.buffer}" is not a buffer` }

      // One range does the work of both, so `carve` wins and `buffer` fills
      // in. A null leaves the renderer's own default in place.
      const range = carve ?? buffer
      if (carve !== null && buffer !== null) {
        cc.warn(`${name}: buffer is ignored (one range both sizes the region and carves it)`)
      }

      // The carve selection, resolved before anything is created so a bad
      // expression cannot leave a renderer behind.
      let boundary: { molName: string; selStr: string } | null = null
      if (args.selection.trim() !== '') {
        const translated = translateSelection(args.selection)
        if (!translated.ok) return translated
        const target = boundaryMolecule(ctx, cc, args.selection)
        if (!target.ok) return target
        boundary = { molName: target.name, selStr: translated.expr }
        if (carve === null) {
          // PyMOL would show the whole box; here the corners come off.
          cc.warn(`${name}: the region is also carved at ${range ?? 'the renderer default'} angstroms`)
        }
      } else if (range !== null) {
        cc.warn(`${name}: carve and buffer need a selection to work from`)
      }

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
        if (boundary && !writeBoundary(ctx, cc.sceneId, existing[0].rendId,
                                       boundary.molName, boundary.selStr, range)) {
          return { ok: false, error: `Error: could not carve "${rendName}"` }
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
      // Only a boxed region needs a centre; a carved one takes its place
      // from the atoms.
      if (!boundary) centreOnView(ctx, cc.sceneId, map.objId, created.newRendId)
      if (!writeLevel(ctx, cc.sceneId, created.newRendId, level)) {
        return { ok: false, error: `Error: could not set the level of "${rendName}"` }
      }
      if (boundary && !writeBoundary(ctx, cc.sceneId, created.newRendId,
                                     boundary.molName, boundary.selStr, range)) {
        return { ok: false, error: `Error: could not carve "${rendName}"` }
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
