/**
 * @file fopen-opt-dlgs/mtzColumns.ts
 * @description Default amplitude / phase / weight column selection for an MTZ
 * file, ported from the UXP fopen-mtzopt-page selectDefaultColumns() logic
 * (uxp_gui/cuemol2/base/content/fopen-mtzopt-page.js). Recognises the common
 * refinement-program column conventions and falls back to the first column of
 * each type otherwise.
 */
import type { MtzColumn } from '../../worker/server/services/getMtzColumnInfo.service';
import type { MtzOptions } from './types';

export type MtzColumnDefaults = Pick<
  MtzOptions,
  'columnF' | 'columnPhi' | 'columnW' | 'phaseEnabled' | 'weightEnabled'
>;

/**
 * Pick default column selections from an MTZ column list.
 *
 * @param columns - F / P / W columns reported by the worker.
 * @returns Default selections and phase/weight checkbox states.
 *
 * @remarks
 * - Phase is enabled by default when any P column exists; Weight only for the
 *   RESOLVE / DM conventions (which carry an explicit FOM column).
 * - Pattern order matches UXP: PHENIX, REFMAC5, SIGMAA, RESOLVE, DM.
 */
export function computeMtzDefaults(columns: MtzColumn[]): MtzColumnDefaults {
  const fcols = columns.filter((c) => c.type === 'F').map((c) => c.name);
  const pcols = columns.filter((c) => c.type === 'P').map((c) => c.name);
  const wcols = columns.filter((c) => c.type === 'W').map((c) => c.name);
  const has = (name: string, type: string) =>
    columns.some((c) => c.name === name && c.type === type);

  // Defaults: first column of each type; phase on when available, weight off.
  let columnF = fcols[0] ?? '';
  let columnPhi = pcols[0] ?? '';
  let columnW = wcols[0] ?? '';
  const phaseEnabled = pcols.length > 0;
  let weightEnabled = false;

  if (has('2FOFCWT', 'F') && has('PH2FOFCWT', 'P')) {
    // PHENIX.REFINE
    columnF = '2FOFCWT';
    columnPhi = 'PH2FOFCWT';
  } else if (has('FWT', 'F') && has('PHWT', 'P')) {
    // REFMAC5
    columnF = 'FWT';
    columnPhi = 'PHWT';
  } else if (has('FWT', 'F') && has('PHIC', 'P')) {
    // SIGMAA
    columnF = 'FWT';
    columnPhi = 'PHIC';
  } else if (has('FP', 'F') && has('PHIM', 'P') && has('FOMM', 'W')) {
    // RESOLVE
    columnF = 'FP';
    columnPhi = 'PHIM';
    columnW = 'FOMM';
    weightEnabled = true;
  } else if (has('FDM', 'F') && has('PHIDM', 'P') && has('FOMDM', 'W')) {
    // DM
    columnF = 'FDM';
    columnPhi = 'PHIDM';
    columnW = 'FOMDM';
    weightEnabled = true;
  }

  return { columnF, columnPhi, columnW, phaseEnabled, weightEnabled };
}
