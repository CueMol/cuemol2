/**
 * @file worker/server/catalog/ops/mapOps.ts
 * @description Ops for electron density maps: fetching one from the PDB and
 * setting how its contour is drawn.
 */

import { listMapRenderers as listMapRenderersService } from '@renderer/worker/server/services/map/renderers'
import { getMapRendererState } from '@renderer/worker/server/services/map/state'
import { setMapRendererProp } from '@renderer/worker/server/services/map/props'
import { streamLoadDensityMap } from '@renderer/worker/server/services/map/streamLoad'
import { pickMapUrl } from '@renderer/worker/shared/pdbUrls'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import type { OpOutcome } from '../op'
import { color, enumOf, optional, real, rendererId, string } from '../params'

/** A four-character PDB accession code. */
const PDB_ID_RE = /^[0-9][0-9a-z]{3}$/i

export const fetchMap = defineOp({
  name: 'fetch_map',
  description:
    'Download the electron density map of a PDB entry (from its deposited structure factors) ' +
    'and add it to the scene with a contour. 2fofc is the usual map; fofc is the difference ' +
    'map, drawn at +/-3 sigma in two colours. Fetch the structure itself with fetch_pdb.',
  params: {
    pdbId: string('Four-character PDB accession code.'),
    mapType: optional(enumOf(['2fofc', 'fofc'], 'Which map: 2fofc (usual) or fofc (difference). Null is 2fofc.')),
    name: optional(string('Name for the map object. Null uses <pdbid>_<mapType>.')),
  },
  mutates: true,
  expose: { tool: 'map', console: true },
  group: 'maps',
  async run(ctx, args, oc) {
    const pdbId = args.pdbId.trim().toLowerCase()
    if (!PDB_ID_RE.test(pdbId)) return { ok: false, error: `"${args.pdbId}" is not a PDB accession code.` }
    const mapType = args.mapType ?? '2fofc'
    const spec = pickMapUrl(pdbId, 'RCSB_CIF', mapType)
    const reqId = oc.streamId('fetch_map')
    oc.noteStream(reqId)
    const res = await streamLoadDensityMap(ctx, {
      reqId,
      url: spec.url,
      readerName: spec.readerName,
      gzip: spec.gzip,
      mapType,
      objectName: args.name ?? `${pdbId}_${mapType}`,
      sceneId: oc.sceneId,
      viewId: oc.viewId,
    })
    if (!res.ok) return { ok: false, error: res.error || `The ${mapType} map of ${pdbId.toUpperCase()} could not be downloaded.` }
    return { ok: true, data: { objectId: res.objId } }
  },
})

export const listMapRenderers = defineOp({
  name: 'list_map_contours',
  description: 'List the contour renderers drawn from density maps, with their current level.',
  params: {},
  mutates: false,
  expose: { tool: 'map', console: true },
  group: 'maps',
  run(ctx, _args, oc): OpOutcome {
    const items = listMapRenderersService(ctx, { sceneId: oc.sceneId }).items
    return {
      ok: true,
      data: {
        contours: items.map((it) => {
          const st = getMapRendererState(ctx, { sceneId: oc.sceneId, rendId: it.rendId }).state
          return {
            rendererId: it.rendId,
            name: `${it.objName}/${it.rendName}`,
            ...(st ? { level: st.siglevel, unit: st.levelUnit, extent: st.extent, color: st.color } : {}),
          }
        }),
      },
    }
  },
})

export const setMapContour = defineOp({
  name: 'set_map_contour',
  description:
    'Change how one map contour is drawn: its level (in sigma, or percent for an EM map), the ' +
    'extent of the box drawn around the view centre (angstroms), its colour and opacity. Give ' +
    'only what should change.',
  params: {
    rendId: rendererId('Uid of the contour renderer, from list_map_contours.'),
    level: optional(real('Contour level in sigma (percent for an EM map). Null leaves it.')),
    extent: optional(real('Half-size of the drawn box in angstroms. Null leaves it.')),
    color: optional(color('Contour colour. Null leaves it.')),
    alpha: optional(real('Opacity, 0 to 1. Null leaves it.')),
  },
  mutates: true,
  expose: { tool: 'map', console: true },
  group: 'maps',
  aliases: [{ name: 'contour', summary: 'Set a map contour: contour 1crn_2fofc/contour1, level=1.5' }],
  run(ctx, args, oc) {
    const writes: [Parameters<typeof setMapRendererProp>[1]['propName'], number | string][] = []
    if (args.level !== null) writes.push(['siglevel', args.level])
    if (args.extent !== null) writes.push(['extent', args.extent])
    if (args.color !== null) writes.push(['color', args.color])
    if (args.alpha !== null) writes.push(['alpha', args.alpha])
    if (writes.length === 0) return { ok: false, error: 'Nothing to change: give level, extent, color or alpha.' }
    for (const [propName, value] of writes) {
      const res = setMapRendererProp(ctx, { sceneId: oc.sceneId, rendId: args.rendId, propName, value, mode: 'commit' })
      const norm = normalizeServiceResult(res, `"${propName}" could not be set on that contour.`)
      if (!norm.ok) return norm
    }
    const st = getMapRendererState(ctx, { sceneId: oc.sceneId, rendId: args.rendId }).state
    return { ok: true, data: st ? { level: st.siglevel, unit: st.levelUnit, extent: st.extent, color: st.color, alpha: st.alpha } : {} }
  },
})

export const MAP_OPS = [fetchMap, listMapRenderers, setMapContour]
