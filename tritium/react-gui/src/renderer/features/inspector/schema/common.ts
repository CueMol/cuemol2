/**
 * @file components/inspector/schema/common.ts
 * @description The pages every node gets, before its type-specific ones.
 *
 * Three variants, because the three kinds of node the inspector opens have
 * genuinely different property sets:
 *
 *   - a renderer (UXP `renderer-common-page.xul`, the overlay shared by every
 *     `dialog.property.*` renderer dialog): Basic settings + Edge lines;
 *   - an object (UXP `object-propdlg.xul` "Common" tab): the same basics minus
 *     the renderer-only ones, plus the read-only source path;
 *   - a renderer group: a RendGroup inherits the full Renderer property set in
 *     C++ but draws nothing itself (`RendGroup::display` is empty), so opacity
 *     / material / edge lines would be dead knobs. Only Name / Visible /
 *     Locked are meaningful.
 *
 * A row is dropped when the node does not expose its property, which is what
 * lets these three cover every node type without asking what it is.
 */

import { eq, not, typeIs } from './predicates'
import type { SchemaSectionDef } from './types'

/** Edge-type options in reading order (the C++ enumdef is alphabetical). */
const EGTYPE_OPTIONS = ['none', 'edges', 'silhouette']

/**
 * Renderer types whose "Edge lines" block is suppressed. Edge / silhouette
 * lines are derived from surface geometry (see the C++ `getEdgeLineType()`
 * checks in MapSurfRenderer / MolSurfRenderer / DirectSurfRenderer), so a
 * renderer that draws only lines -- `simple` / `trace` (bond lines) and
 * `contour` (a wireframe map mesh) -- has no faces to outline and the three
 * properties are dead knobs there. They inherit `egtype` / `eglinew` /
 * `egcolor` from the C++ `Renderer` base regardless, so the gate has to be by
 * type rather than by property presence.
 */
const NO_EDGE_LINE_TYPES = ['simple', 'trace', 'contour']

export const RENDERER_COMMON_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'common-basic',
    title: 'Basic settings',
    defaultExpanded: true,
    hideWhenEmpty: true,
    rows: [
      { kind: 'text', key: 'name', label: 'Name' },
      { kind: 'sel', key: 'sel', label: 'Selection' },
      { kind: 'bool', key: 'visible', label: 'Visible' },
      { kind: 'bool', key: 'locked', label: 'Locked' },
      {
        kind: 'asyncSelect',
        key: 'material',
        label: 'Material',
        source: { kind: 'materials' },
        emptyOption: 'none',
      },
      { kind: 'num', key: 'alpha', label: 'Opacity', min: 0, max: 1, step: 0.1, realtime: true },
    ],
  },
  {
    key: 'common-edge',
    title: 'Edge lines',
    defaultExpanded: true,
    visibleWhen: not(typeIs(...NO_EDGE_LINE_TYPES)),
    hideWhenEmpty: true,
    rows: [
      { kind: 'enum', key: 'egtype', label: 'Edge type', options: EGTYPE_OPTIONS },
      // Width and colour describe lines that are not drawn while the type is
      // "none" (UXP `updateEnabledState`).
      {
        kind: 'num',
        key: 'eglinew',
        label: 'Width',
        min: 0,
        max: 0.5,
        step: 0.01,
        unit: 'Å',
        disabledWhen: eq('egtype', 'none'),
      },
      { kind: 'color', key: 'egcolor', label: 'Color', disabledWhen: eq('egtype', 'none') },
    ],
  },
]

export const OBJECT_COMMON_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'common-basic',
    title: 'Basic settings',
    defaultExpanded: true,
    hideWhenEmpty: true,
    rows: [
      { kind: 'text', key: 'name', label: 'Name' },
      // Selection exists on MolCoord only.
      { kind: 'sel', key: 'sel', label: 'Selection' },
      { kind: 'bool', key: 'visible', label: 'Visible' },
      { kind: 'bool', key: 'locked', label: 'Locked' },
      // UXP "Linked" is the object's read-only `src` source path.
      { kind: 'text', key: 'src', label: 'Linked' },
    ],
  },
]

export const REND_GROUP_COMMON_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'common-basic',
    title: 'Basic settings',
    defaultExpanded: true,
    rows: [
      { kind: 'text', key: 'name', label: 'Name' },
      { kind: 'bool', key: 'visible', label: 'Visible' },
      { kind: 'bool', key: 'locked', label: 'Locked' },
    ],
  },
]
