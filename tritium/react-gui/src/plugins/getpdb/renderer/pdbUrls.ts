/**
 * @file plugins/getpdb/renderer/pdbUrls.ts
 * @description Where the Get PDB dialog reads its URLs from.
 *
 * Both halves live in `worker/shared/pdbUrls.ts`, because worker services
 * fetch entries and maps too (pymconsole `fetch`); they are re-exported here
 * so this stays the one place the dialog reads URLs from.
 *
 * The reader name travels with the URL because the two must agree: picking
 * the reader by extension on the way back re-introduces the `.cif`
 * ambiguity, where the density-map reader wins over the coordinate one by
 * JSON order.
 */

export { pickCoordUrl, pickMapUrl } from '@renderer/worker/shared/pdbUrls'
export type { CoordServerType, CoordUrlSpec, MapUrlSpec } from '@renderer/worker/shared/pdbUrls'
