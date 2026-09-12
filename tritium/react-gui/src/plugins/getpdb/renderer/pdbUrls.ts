/**
 * @file plugins/getpdb/renderer/pdbUrls.ts
 * @description Where a PDB entry is fetched from, per server choice.
 *
 * The reader name travels with the URL because the two must agree: picking
 * the reader by extension on the way back re-introduces the `.cif`
 * ambiguity, where the density-map reader wins over the coordinate one by
 * JSON order.
 */

import type { CoordServerType, MapServerType } from './GetPdbDialog'

interface CoordUrlSpec {
  url: string
  readerName: string
  /** Extension of the virtual filename the renderer lookup is done against. */
  ext: string
}

/** The coordinate file for `pdbid` on the chosen server. */
export function pickCoordUrl(pdbid: string, server: CoordServerType): CoordUrlSpec {
  switch (server) {
    case 'RCSB_CIF':
      return {
        url: `https://files.rcsb.org/download/${pdbid}.cif`,
        readerName: 'mmcif',
        ext: 'cif',
      }
    case 'RCSB_PDB':
      return {
        url: `https://files.rcsb.org/download/${pdbid}.pdb`,
        readerName: 'pdb',
        ext: 'pdb',
      }
  }
}

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
