/**
 * @file worker/server/catalog/ops/mapOps.ts
 * @description Ops for electron density maps: fetching one from the PDB,
 * EMDB or a URL, and setting how its contour is drawn.
 */

import { listMapRenderers as listMapRenderersService } from '@renderer/worker/server/services/map/renderers'
import { getMapRendererState } from '@renderer/worker/server/services/map/state'
import { setMapRendererProp } from '@renderer/worker/server/services/map/props'
import { streamLoadDensityMap } from '@renderer/worker/server/services/map/streamLoad'
import { fetchEmdbMap, resolveEmdbId } from '@renderer/worker/server/services/map/fetchEmdbMap'
import { PDB_ID_RE, pickMapUrl } from '@renderer/worker/shared/pdbUrls'
import { mapUrlFetch } from '@renderer/worker/shared/dbSources'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import type { OpOutcome } from '../op'
import { boolean, color, enumOf, optional, real, rendererId, string } from '../params'


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
    source: optional(
      enumOf(['RCSB_CIF', 'EBI_MTZ'], 'Where from: RCSB_CIF (validation report coefficients) or EBI_MTZ (PDBe MTZ). Null is RCSB_CIF.'),
    ),
  },
  mutates: true,
  describe: (a) => `Fetch the ${a.mapType ?? '2fofc'} map of ${a.pdbId}`,
  expose: { tool: 'map', console: true },
  group: 'maps',
  async run(ctx, args, oc) {
    const pdbId = args.pdbId.trim().toLowerCase()
    if (!PDB_ID_RE.test(pdbId)) return { ok: false, error: `"${args.pdbId}" is not a PDB accession code.` }
    const mapType = args.mapType ?? '2fofc'
    const spec = pickMapUrl(pdbId, args.source ?? 'RCSB_CIF', mapType)
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

export const fetchEmdb = defineOp({
  name: 'fetch_emdb',
  description:
    'Download a cryo-EM map from EMDB and add it to the scene as an isosurface at the authors\' ' +
    'recommended contour level. Give the EMDB code (EMD-11638), or the PDB ID of a cryo-EM ' +
    'entry to fetch the map its model was built into. Maps are large (tens to hundreds of MB), ' +
    'so this can take a while. Fetch the model itself with fetch_pdb.',
  params: {
    id: string('EMDB code such as EMD-11638, or the PDB ID of a cryo-EM entry.'),
    name: optional(string('Name for the map object. Null uses emd_<number>.')),
    source: optional(enumOf(['WWPDB', 'EBI', 'PDBJ'], 'Which mirror: WWPDB (files.wwpdb.org), EBI or PDBJ (PDBj, Japan). Null is WWPDB.')),
    level: optional(real('Contour level in the map\'s own density units. Null uses the level EMDB recommends (the top 1% of grid points when it gives none).')),
  },
  mutates: true,
  describe: (a) => `Fetch the EMDB map of ${a.id}`,
  expose: { tool: 'map', console: true },
  group: 'maps',
  async run(ctx, args, oc) {
    const resolved = await resolveEmdbId(ctx, args.id)
    if (!resolved.ok) return { ok: false, error: resolved.error }
    const reqId = oc.streamId('fetch_emdb')
    oc.noteStream(reqId)
    const res = await fetchEmdbMap(ctx, {
      reqId,
      emdbId: resolved.emdbId,
      server: args.source ?? 'WWPDB',
      objectName: args.name ?? undefined,
      contourLevel: args.level,
      sceneId: oc.sceneId,
      viewId: oc.viewId,
    })
    if (!res.ok) return { ok: false, error: res.error || `The map of ${resolved.emdbId} could not be downloaded.` }
    return { ok: true, data: { objectId: res.objId, emdbId: res.emdbId } }
  },
})

export const fetchMapUrl = defineOp({
  name: 'fetch_map_url',
  description:
    'Download a density map file (CCP4 / MRC: .map, .mrc, .ccp4, or one of them .gz) from a URL and add it ' +
    'to the scene. CueMol tells a cryo-EM map from a crystallographic one when it reads it: a cryo-EM ' +
    'map is drawn as an isosurface, a crystallographic one as a contour at 1 sigma. For an EMDB entry ' +
    'use fetch_emdb, for a PDB entry\'s map fetch_map.',
  params: {
    url: string('The URL (http or https) of the map file.'),
    name: optional(string('Name for the map object. Null uses the file name.')),
    gzip: optional(boolean('The download is gzip-compressed. Null tells it from a .gz at the end of the file name.')),
  },
  mutates: true,
  describe: (a) => `Fetch the map at ${a.url}`,
  expose: { tool: 'map', console: true },
  group: 'maps',
  async run(ctx, args, oc) {
    const spec = mapUrlFetch(args.url)
    if (!spec) return { ok: false, error: `"${args.url}" is not the http(s) URL of a .map, .mrc or .ccp4 file.` }
    const reqId = oc.streamId('fetch_map_url')
    oc.noteStream(reqId)
    const res = await streamLoadDensityMap(ctx, {
      reqId,
      url: spec.url,
      readerName: spec.readerName,
      gzip: args.gzip ?? spec.gzip,
      mapType: 'auto',
      objectName: args.name ?? spec.name,
      sceneId: oc.sceneId,
      viewId: oc.viewId,
    })
    if (!res.ok) return { ok: false, error: res.error || `${spec.url} could not be downloaded.` }
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

export const MAP_OPS = [fetchMap, fetchEmdb, fetchMapUrl, listMapRenderers, setMapContour]
