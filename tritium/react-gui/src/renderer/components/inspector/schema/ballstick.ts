/**
 * @file components/inspector/schema/ballstick.ts
 * @description The `ballstick` renderer page, and the rows `anisou` reuses.
 *
 * UXP's `ballstick-propdlg`: sphere subdivision, bond width and atom radius,
 * then the aromatic-ring display with its thickness and colour. The ring rows
 * follow the toggle -- UXP's `updateEnabledState` disabled them the same way.
 *
 * The anisotropic-displacement renderer draws the same atoms and bonds, so it
 * shows these rows as its first section and adds its own on top -- built from
 * here rather than copied. It asks for them without the live preview: it draws
 * an ellipsoid per atom, which is too expensive to rebuild per drag frame.
 */

import type { PropRowDef, SchemaSectionDef } from './types'
import { isOff } from './predicates'

/** Ring thickness and colour apply only while the ring display is on. */
const ringOff = isOff('ring')

/**
 * Atoms and bonds, as ball-and-stick draws them.
 *
 * `realtime` previews the value on the renderer while dragging. Whether that
 * is affordable depends on what is being drawn, not on the rows, so the
 * caller decides: spheres and cylinders redraw cheaply, the ellipsoids the
 * anisotropic renderer puts through them do not.
 */
export function ballstickRows(opts: { realtime: boolean }): PropRowDef[] {
  const { realtime } = opts
  return [
    { kind: 'num', key: 'detail', label: 'Detail', min: 2, max: 20, step: 1, decimals: 0, realtime },
    { kind: 'num', key: 'bondw', label: 'Bond width', min: 0, max: 3, step: 0.01, unit: 'Å', realtime },
    { kind: 'num', key: 'sphr', label: 'Atom radius', min: 0, max: 3, step: 0.01, unit: 'Å', realtime },
    { kind: 'bool', key: 'ring', label: 'Show ring' },
    {
      kind: 'num',
      key: 'thickness',
      label: 'Thickness',
      min: 0,
      max: 3,
      step: 0.01,
      unit: 'Å',
      realtime,
      disabledWhen: ringOff,
    },
    { kind: 'color', key: 'ringcolor', label: 'Ring color', disabledWhen: ringOff },
  ]
}

export const BALLSTICK_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'ballstick',
    title: 'Ball and stick',
    defaultExpanded: true,
    rows: ballstickRows({ realtime: true }),
  },
]
