/**
 * @file features/inspector/schema/dsurface.ts
 * @description The `dsurface` renderer page.
 *
 * UXP's `dsurf-propdlg`: a "Draw" groupbox (mode, line / point size, surface
 * type, tessellation detail) over the shared per-element radii the probe rolls
 * on. The Algorithm row is new: the distance-field surface used to be a
 * separate renderer type (`dsurf2`) and is now one of the three mesh builders
 * `surfalgor` selects.
 */

import type { SchemaSectionDef } from './types'
import { vdwRadiiRows } from '@renderer/features/inspector/schema/shared/vdwRadii'
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

const SURFALGOR_LABELS: Record<string, string> = {
  distfield: 'Distance field',
  meshms: 'MeshMS (analytic SES)',
  edtsurf: 'EDTSurf (voxel)',
}

function sections(): SchemaSectionDef[] {
  return [
    {
      key: 'dsurface-main',
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
        // Listed cheapest-name-first rather than in the enumdef's alphabetical
        // order: MeshMS builds the SES analytically and falls back to the
        // distance field where it cannot (non-SES surface types, builds
        // without it).
        {
          kind: 'mappedEnum',
          key: 'surfalgor',
          label: 'Algorithm',
          labels: SURFALGOR_LABELS,
          options: ['distfield', 'meshms', 'edtsurf'],
        },
        { kind: 'mappedEnum', key: 'surftype', label: 'Surface type', labels: SURFTYPE_LABELS },
        // Powers of two plus 24: a direct surface is tessellated over the
        // whole molecule, so the steps near the top are far apart in cost and
        // 16 -> 32 is too big a jump to be the only choice there. The grid
        // algorithms carry a cell budget that coarsens rather than allocate
        // gigabytes at the top, and say so in the log.
        { kind: 'numEnum', keys: ['detail'], label: 'Detail', ladder: [1, 2, 4, 8, 16, 24, 32] },
      ],
    },
    {
      key: 'dsurface-radii',
      title: 'Atom radii',
      defaultExpanded: true,
      // Rebuilding a surface per drag frame is too expensive to preview.
      rows: vdwRadiiRows({ realtime: false }),
    },
  ]
}

export const DSURFACE_SECTIONS: SchemaSectionDef[] = sections()
