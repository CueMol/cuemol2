/**
 * @file components/inspector/schema/map.ts
 * @description The map renderers' pages: `contour` (MapMeshRenderer),
 * `isosurf` (MapSurfRenderer) and the legacy `gpu_mapmesh`
 * (GLSLMapMeshRenderer2).
 *
 * All three carry the C++ `MapRenderer` properties, so the centre-update
 * selector, the cryo-EM region / level-of-detail rows and the display-limit
 * block are written once here and shared. `gpu_mapmesh` is the GPU version of
 * the contour, so it shows the contour's rows under its own title.
 *
 * Parity notes (`contour-propdlg.js` / `isosurf-propdlg.js`):
 *   - "Center update" is one control over two booleans, and "Limit display by"
 *     has a toggle that is not a property at all, so both are blocks (see
 *     `rows/CenterUpdateRow`, `rows/LimitDisplayRows`).
 *   - In the full region the whole map is generated at the budget stride, so
 *     the box-only knobs (buffer size, max grid size, periodic boundary) do
 *     not apply and the budget ones do.
 */

import { eq } from './predicates'
import { CenterUpdateRow, LimitDisplayRows } from '@renderer/features/inspector/rows'
import type { Predicate, PropRowDef, SchemaSectionDef } from './types'

/** Display labels of the `region_mode` enum (raw C++ ids stay the values). */
const REGION_MODE_LABELS: Record<string, string> = {
  auto: 'Auto',
  box: 'Box around center',
  full: 'Full map',
}
const REGION_MODE_ORDER = ['auto', 'box', 'full']

/** Display labels of the `lod` enum (marching / sampling stride). */
const LOD_LABELS: Record<string, string> = {
  auto: 'Auto',
  step1: '1 (full resolution)',
  step2: '2',
  step4: '4',
  step8: '8',
}
const LOD_ORDER = ['auto', 'step1', 'step2', 'step4', 'step8']

/**
 * The renderer generates the whole map rather than a box around the centre.
 *
 * Two keys, because "auto" is a request the addon resolves: it reports what it
 * settled on in the read-only `region_mode_resolved`, and only falls back to
 * the raw `region_mode` when it does not expose that. An unresolved "auto"
 * counts as a box.
 */
export const isFullRegion: Predicate = (ctx) => {
  const resolved = ctx.value('region_mode_resolved')
  if (resolved !== undefined) return resolved === 'full'
  return ctx.value('region_mode') === 'full'
}

/** The opposite, as a gate for the box-only rows. */
const isBoxRegion: Predicate = (ctx) => !isFullRegion(ctx)

/** Centre update, then region / level of detail: the head of every map page. */
const MAP_HEAD_ROWS: PropRowDef[] = [
  { kind: 'custom', key: 'center-update', Component: CenterUpdateRow },
  {
    kind: 'mappedEnum',
    key: 'region_mode',
    label: 'Region',
    labels: REGION_MODE_LABELS,
    options: REGION_MODE_ORDER,
  },
  {
    kind: 'mappedEnum',
    key: 'lod',
    label: 'Level of detail',
    labels: LOD_LABELS,
    options: LOD_ORDER,
  },
  {
    kind: 'numInput',
    key: 'lod_budget',
    label: 'LoD budget',
    visibleWhen: isFullRegion,
    min: 1,
    max: 256,
    step: 1,
    unit: 'Mcell',
  },
  { kind: 'bool', key: 'zoom_refine', label: 'Refine on zoom', visibleWhen: isFullRegion },
]

/** The display-limit block: the tail of every map page. */
const LIMIT_ROW: PropRowDef = {
  kind: 'custom',
  key: 'limit-display',
  Component: LimitDisplayRows,
}

/** The contour rows, shared by `contour` and its GPU version. */
const contourRows = (): PropRowDef[] => [
  ...MAP_HEAD_ROWS,
  { kind: 'num', key: 'width', label: 'Line width', min: 0, max: 10, step: 0.1, unit: 'px', realtime: true },
  {
    kind: 'numInput',
    key: 'bufsize',
    label: 'Buffer size',
    visibleWhen: isBoxRegion,
    min: 50,
    max: 200,
    step: 10,
  },
  { kind: 'bool', key: 'use_pbc', label: 'Use periodic boundary', visibleWhen: isBoxRegion },
  LIMIT_ROW,
]

export const CONTOUR_SECTIONS: SchemaSectionDef[] = [
  { key: 'contour-main', title: 'Contour', defaultExpanded: true, rows: contourRows() },
]

export const GPU_MAPMESH_SECTIONS: SchemaSectionDef[] = [
  { key: 'gpu-mapmesh-main', title: 'GPU contour', defaultExpanded: true, rows: contourRows() },
]

export const ISOSURF_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'isosurf-main',
    title: 'Isosurf',
    defaultExpanded: true,
    rows: [
      ...MAP_HEAD_ROWS,
      { kind: 'enum', key: 'drawmode', label: 'Drawing mode' },
      {
        kind: 'num',
        key: 'width',
        label: 'Line/Point size',
        // A filled surface has neither lines nor points to size.
        disabledWhen: eq('drawmode', 'fill'),
        min: 0,
        max: 10,
        step: 0.1,
        unit: 'px',
        realtime: true,
      },
      {
        kind: 'numInput',
        key: 'max_grids',
        label: 'Max grid size',
        visibleWhen: isBoxRegion,
        min: 50,
        max: 1000,
        step: 10,
      },
      { kind: 'bool', key: 'cullface', label: 'Back-face culling' },
      { kind: 'bool', key: 'use_pbc', label: 'Use periodic boundary', visibleWhen: isBoxRegion },
      LIMIT_ROW,
    ],
  },
]
