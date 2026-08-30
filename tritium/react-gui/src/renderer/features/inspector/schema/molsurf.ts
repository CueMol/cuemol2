/**
 * @file features/inspector/schema/molsurf.ts
 * @description The `molsurf` renderer page.
 *
 * A precomputed surface object, so its page shares the drawing-mode block
 * with the direct surfaces but not their tessellation or atom radii -- those
 * belong to the calculation, which already happened. What it has instead is a
 * reference molecule and a selection within it, which is how the surface is
 * cut down for display.
 */

import type { SchemaSectionDef } from './types'
import { eq } from './predicates'

const DRAWMODE_LABELS: Record<string, string> = {
  fill: 'Fill',
  line: 'Wireframe',
  point: 'Dots',
}

export const MOLSURF_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'molsurf-main',
    title: 'MolSurf',
    defaultExpanded: true,
    rows: [
      { kind: 'mappedEnum', key: 'drawmode', label: 'Drawing mode', labels: DRAWMODE_LABELS },
      {
        kind: 'num',
        key: 'width',
        label: 'Line/Point size',
        min: 0,
        max: 10,
        step: 0.1,
        decimals: 1,
        unit: 'px',
        realtime: true,
        // A filled mesh has no line or point to size.
        disabledWhen: eq('drawmode', 'fill'),
      },
      {
        kind: 'asyncSelect',
        key: 'target',
        label: 'Selection mol',
        source: { kind: 'molObjects' },
        emptyOption: 'blank',
      },
      { kind: 'sel', key: 'showsel', label: 'Selection' },
    ],
  },
]
