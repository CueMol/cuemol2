/**
 * @file components/inspector/schema/spline.ts
 * @description The `spline` renderer page.
 *
 * No UXP dialog to port: curated from the C++ `SplineRenderer.qif`. A single
 * section -- no nested cross-section or putty -- and the tube cap-type
 * properties are left out, since a line has no cap to shape.
 *
 * Smoothness and line width preview while dragging. The axial detail is a
 * subdivision count, dialled with the drag field's arrows (integer steps only
 * -- the fine / coarse snaps are pinned to 1 so a modifier cannot land it on a
 * fraction).
 */

import type { SchemaSectionDef } from './types'

export const SPLINE_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'spline',
    title: 'Spline',
    defaultExpanded: true,
    rows: [
      { kind: 'numEnum', keys: ['axialdetail'], label: 'Axial detail', min: 1, max: 10 },
      { kind: 'num', key: 'smooth', label: 'Smoothness', min: 0, max: 0.5, step: 0.01, decimals: 2, realtime: true },
      { kind: 'bool', key: 'smoothcolor', label: 'Smooth color' },
      { kind: 'num', key: 'line_width', label: 'Line width', min: 0, max: 10, step: 0.2, unit: 'px', realtime: true },
      { kind: 'bool', key: 'segend_fade', label: 'Segment-end fade out' },
      // Empty means "whatever this polymer's default is", resolved by C++.
      { kind: 'text', key: 'pivotatom', label: 'Pivot atom name', placeholder: '(default)' },
    ],
  },
]
