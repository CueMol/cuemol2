/**
 * @file components/inspector/schema/shared/vdwRadii.ts
 * @description The per-element van der Waals radius rows.
 *
 * UXP's `propeditor-radii-common` "Atom radii" groupbox, shared by every
 * renderer that sizes atoms by element: CPK draws spheres of these radii, the
 * direct-surface renderers roll a probe over them.
 *
 * They differ only in whether the value previews while dragging -- a sphere
 * radius is cheap to redraw, a surface is not -- so `realtime` is the
 * parameter.
 */

import type { NumRowDef } from '@renderer/features/inspector/schema/types'

/** Element order of the UXP "Atom radii" tab. */
const ELEMENTS: { key: string; label: string }[] = [
  { key: 'vdwr_C', label: 'Carbon' },
  { key: 'vdwr_N', label: 'Nitrogen' },
  { key: 'vdwr_O', label: 'Oxygen' },
  { key: 'vdwr_S', label: 'Sulfur' },
  { key: 'vdwr_P', label: 'Phosphorus' },
  { key: 'vdwr_H', label: 'Hydrogen' },
  { key: 'vdwr_X', label: 'Others' },
]

/** The seven radius rows. UXP bounds: 0 to 3 A by 0.05, shown to 2 decimals. */
export function vdwRadiiRows(opts: { realtime: boolean }): NumRowDef[] {
  return ELEMENTS.map(({ key, label }) => ({
    kind: 'num',
    key,
    label,
    min: 0,
    max: 3,
    step: 0.05,
    fineSnap: 0.01,
    coarseSnap: 0.5,
    decimals: 2,
    unit: 'Å',
    realtime: opts.realtime,
  }))
}
