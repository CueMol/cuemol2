/**
 * @file plugins/getpdb/renderer/pdbUrls.ts
 * @description Where a PDB entry's density map is fetched from, per server
 * choice.
 *
 * The coordinate half lives in `worker/shared/pdbUrls.ts`, because a worker
 * service fetches entries too; it is re-exported here so this stays the one
 * place the dialog reads URLs from.
 *
 * The reader name travels with the URL because the two must agree: picking
 * the reader by extension on the way back re-introduces the `.cif`
 * ambiguity, where the density-map reader wins over the coordinate one by
 * JSON order.
 */

import type { MapServerType } from './GetPdbDialog'

export { pickCoordUrl } from '@renderer/worker/shared/pdbUrls'
export type { CoordServerType, CoordUrlSpec } from '@renderer/worker/shared/pdbUrls'

interface MapUrlSpec {
  url: string
  readerName: 'mmcifmap' | 'mtzmap'
  gzip: boolean
}

/** The 2Fo-Fc or Fo-Fc map coefficients for `pdbid` on the chosen server. */
export function pickMapUrl(
  pdbid: string,
  server: MapServerType,
  mapType: '2fofc' | 'fofc',
): MapUrlSpec {
  if (server === 'EBI_MTZ') {
    return {
      url: `https://www.ebi.ac.uk/pdbe/coordinates/files/${pdbid}_map.mtz`,
      readerName: 'mtzmap',
      gzip: false,
    }
  }
  // RCSB_CIF: validation_reports cif.gz. mid = middle two chars of pdbid.
  const mid = pdbid.substring(1, 3)
  const suffix = mapType === '2fofc' ? '2fo-fc' : 'fo-fc'
  return {
    url: `https://files.rcsb.org/pub/pdb/validation_reports/${mid}/${pdbid}/${pdbid}_validation_${suffix}_map_coef.cif.gz`,
    readerName: 'mmcifmap',
    gzip: true,
  }
}
