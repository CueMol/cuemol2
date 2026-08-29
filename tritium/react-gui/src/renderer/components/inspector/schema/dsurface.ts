/**
 * @file components/inspector/schema/dsurface.ts
 * @description The `dsurface` and `dsurf2` renderer pages.
 *
 * UXP's `dsurf-propdlg`: a "Draw" groupbox (mode, line / point size, surface
 * type, tessellation detail) over the shared per-element radii the probe rolls
 * on. `dsurf2` is the distance-field surface and shares the property set, so
 * it shares the page.
 */

import type { SchemaSectionDef } from './types'
import { vdwRadiiRows } from './shared/vdwRadii'
import { eq } from './predicates'

const DRAWMODE_LABELS: Record<string, string> = {
  fill: 'Fill',
  line: 'Wireframe',
  point: 'Dots',
}

const SURFTYPE_LABELS: Record<string, string> = {
  vdw: 'van der Waals',
  sas: 'Solvent accessible',
  ses: 'Solvent excluded',
}

/** Both types render the same page; only the section keys differ. */
function sections(prefix: string): SchemaSectionDef[] {
  return [
    {
      key: `${prefix}-main`,
      title: 'Surface',
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
          // A filled mesh has no line or point to size.
          disabledWhen: eq('drawmode', 'fill'),
        },
        { kind: 'mappedEnum', key: 'surftype', label: 'Surface type', labels: SURFTYPE_LABELS },
        // A slider so the density range can be swept.
        { kind: 'numEnum', keys: ['detail'], label: 'Detail', min: 1 },
      ],
    },
    {
      key: `${prefix}-radii`,
      title: 'Atom radii',
      defaultExpanded: true,
      // Rebuilding a surface per drag frame is too expensive to preview.
      rows: vdwRadiiRows({ realtime: false }),
    },
  ]
}

export const DSURFACE_SECTIONS: SchemaSectionDef[] = sections('dsurface')
export const DSURF2_SECTIONS: SchemaSectionDef[] = sections('dsurf2')
