/**
 * @file worker/server/services/apbs/grid.ts
 * @description Choosing the two grids APBS solves on.
 *
 * The coarse grid covers the whole molecule, the fine grid the selection with
 * padding; the potential the user sees comes from the fine one. The molecule
 * is measured through a temporary selection, which is why the caller has to
 * put the original one back whatever happens.
 */
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { Grid } from './types';
import { COARSE_FACTOR, FINE_PADDING, GRID_MULTIPLE } from './types';
/** Clamp a numeric option to a positive value, falling back to `dflt`. */
export function positiveOr(value: number, dflt: number): number {
  return Number.isFinite(value) && value > 0 ? value : dflt;
}

/**
 * Derive the APBS mg-auto grid from the molecule bounding box (UXP
 * `calcGridDim`): coarse = box * 1.7, fine = min(coarse, box + 20 A), grid
 * points rounded up to `32 * ceil(fine / spacing / 32) + 1` per axis.
 *
 * @remarks When a selection is used, the bounding box is read with the
 * molecule's `sel` temporarily set to it (UXP swaps `tgtmol.sel` and restores),
 * so the grid is sized to the selected atoms.
 */
export function computeGrid(
  mol: MolCoord,
  sel: MolSelection | null,
  spacing: number,
): Grid {
  const anyMol = mol as unknown as {
    sel: MolSelection;
    getBoundBoxMin: (b: boolean) => { x: number; y: number; z: number };
    getBoundBoxMax: (b: boolean) => { x: number; y: number; z: number };
  };

  let min: { x: number; y: number; z: number };
  let max: { x: number; y: number; z: number };
  // Sizing the grid to a selection means borrowing mol.sel for two getter
  // calls. Only do that when the current value can be read back: the restore
  // used to be `if (oldSel)`, so a throwing getter -- or a molecule with no
  // selection -- left the user's selection permanently replaced by the APBS
  // one, outside any undo transaction.
  let oldSel: MolSelection | null = null;
  let canRestore = false;
  if (sel) {
    try {
      oldSel = anyMol.sel;
      canRestore = true;
    } catch {
      canRestore = false;
    }
  }
  if (sel && canRestore) {
    anyMol.sel = sel;
    try {
      const vmin = anyMol.getBoundBoxMin(true);
      const vmax = anyMol.getBoundBoxMax(true);
      min = { x: vmin.x, y: vmin.y, z: vmin.z };
      max = { x: vmax.x, y: vmax.y, z: vmax.z };
    } finally {
      try {
        // Assign back exactly what was read, null included -- the point is to
        // leave mol.sel as it was found.
        (anyMol as { sel: MolSelection | null }).sel = oldSel;
      } catch (e) {
        console.warn('APBS grid: could not restore the molecule selection:', e);
      }
    }
  } else {
    const vmin = anyMol.getBoundBoxMin(false);
    const vmax = anyMol.getBoundBoxMax(false);
    min = { x: vmin.x, y: vmin.y, z: vmin.z };
    max = { x: vmax.x, y: vmax.y, z: vmax.z };
  }

  const dim = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  if (Math.abs(dim.x) < 1e-6 && Math.abs(dim.y) < 1e-6 && Math.abs(dim.z) < 1e-6) {
    throw new Error('molecule bounding box is empty');
  }

  const nden = positiveOr(spacing, 1.0);
  const axis = (d: number) => {
    const coarse = d * COARSE_FACTOR;
    const fine = Math.min(coarse, d + FINE_PADDING);
    const cs = Math.ceil(fine / nden / GRID_MULTIPLE);
    const pts = GRID_MULTIPLE * cs + 1;
    return { coarse, fine, pts };
  };
  const ax = axis(dim.x);
  const ay = axis(dim.y);
  const az = axis(dim.z);
  return {
    pts: { x: ax.pts, y: ay.pts, z: az.pts },
    coarse: { x: ax.coarse, y: ay.coarse, z: az.coarse },
    fine: { x: ax.fine, y: ay.fine, z: az.fine },
  };
}
