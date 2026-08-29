/**
 * @file components/inspector/schema/cpk.ts
 * @description The `cpk` renderer page.
 *
 * UXP's `cpk-propdlg`: an "Atom radii" groupbox over the shared per-element
 * radii, and a loose sphere-subdivision row that sat outside it. The two stay
 * separate accordions so the grouping survives.
 */

import type { SchemaSectionDef } from './types'
import { vdwRadiiRows } from './shared/vdwRadii'

export const CPK_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'cpk-radii',
    title: 'Atom radii',
    defaultExpanded: true,
    // Spheres are cheap to redraw, so the radius previews while dragging.
    rows: vdwRadiiRows({ realtime: true }),
  },
  {
    key: 'cpk-detail',
    title: 'Detail',
    defaultExpanded: true,
    rows: [
      { kind: 'numEnum', keys: ['detail'], label: 'Detail', min: 2 },
    ],
  },
]
