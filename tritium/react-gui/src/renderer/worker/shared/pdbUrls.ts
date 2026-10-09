/**
 * @file worker/shared/pdbUrls.ts
 * @description Where a PDB entry's coordinate file and density map are fetched from.
 *
 * Shared rather than owned by the Get PDB dialog because both threads build
 * this URL: the dialog does, and so does a worker service that fetches an
 * entry without a dialog in front of it.
 *
 * The reader name travels with the URL because the two must agree: picking
 * the reader by extension on the way back re-introduces the `.cif` ambiguity,
 * where the density-map reader wins over the coordinate one by JSON order.
 */

/** Which server, and therefore which format, a coordinate file comes from. */
/** A four-character PDB accession code: a digit, then three letters or digits. */
export const PDB_ID_RE = /^[0-9][0-9a-z]{3}$/i

export type CoordServerType = 'RCSB_CIF' | 'RCSB_PDB'

export interface CoordUrlSpec {
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

/** Which server a density map's coefficients come from. */
export type MapServerType = 'RCSB_CIF' | 'EBI_MTZ'

export interface MapUrlSpec {
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
