/**
 * @file worker/shared/pdbUrls.ts
 * @description Where a PDB entry's coordinate file is fetched from.
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
