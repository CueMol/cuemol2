/**
 * @file components/inspector/schema/atomintr.ts
 * @description The `atomintr` renderer's pages (C++ `AtomIntrRenderer`).
 *
 * It draws the distance / angle / torsion measurement lines (and optional
 * value labels) between atoms. Migrated from the UXP `atomintr-propdlg.xul`
 * "Interaction" tab, whose groupboxes become the four pages here.
 *
 * Parity notes:
 *   - The width unit follows the mode: Angstroms as a 3D tube, pixels as a
 *     simple line. It is the same property either way, which is what the
 *     row's unit function is for.
 *   - Mode-gated controls (detail / caps) are disabled rather than hidden, as
 *     in UXP. A renderer with no `mode` property at all counts as the tube
 *     default, so nothing is greyed out for it.
 *   - There is no "dashed" property: a line is dashed when any of the six
 *     stipple lengths is non-negative. That block is a component (see
 *     `rows/DashedStippleRows`), because a synthetic toggle over six
 *     properties plus a strip of compact cells is not a row.
 *   - The label font properties are not in the UXP dialog but are exposed by
 *     the renderer; they are gated on "Show label" so the page stays
 *     consistent with that toggle.
 */

import { and, eq, neq, or, present } from './predicates'
import { DashedStippleRows } from '../rows'
import type { SchemaSectionDef } from './types'

const MODE_LABELS: Record<string, string> = {
  simple: 'Simple line',
  fancy: '3D tube',
}
const CAP_LABELS: Record<string, string> = {
  flat: 'Flat',
  sphere: 'Round',
  arrow: 'Arrow',
}
const FONT_STYLE_OPTIONS = [
  { label: 'Normal', value: 'normal' },
  { label: 'Italic', value: 'italic' },
]
const FONT_WEIGHT_OPTIONS = [
  { label: 'Normal', value: 'normal' },
  { label: 'Bold', value: 'bold' },
]

/** Drawn as a simple line rather than a tube. An absent mode is the tube. */
const isSimple = and(present('mode'), neq('mode', 'fancy'))
/** Neither end is an arrow head, so there is no arrow to size. */
const noArrow = and(neq('captype_start', 'arrow'), neq('captype_end', 'arrow'))

export const ATOMINTR_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'atomintr-main',
    title: 'Interaction',
    defaultExpanded: true,
    rows: [
      { kind: 'mappedEnum', key: 'mode', label: 'Mode', labels: MODE_LABELS },
      {
        kind: 'num',
        key: 'width',
        label: 'Width',
        min: 0,
        max: 5,
        step: 0.05,
        unit: (ctx) => (isSimple(ctx) ? 'px' : 'Å'),
      },
      { kind: 'color', key: 'color', label: 'Color' },
      { kind: 'bool', key: 'showlabel', label: 'Show label' },
    ],
  },
  {
    key: 'atomintr-dashed',
    title: 'Dashed line',
    defaultExpanded: true,
    rows: [{ kind: 'custom', key: 'dash-pattern', Component: DashedStippleRows }],
  },
  {
    key: 'atomintr-tube',
    title: '3D tube',
    defaultExpanded: true,
    // A simple line has no tube geometry, so the whole page is inert for it.
    disabledWhen: isSimple,
    rows: [
      { kind: 'num', key: 'detail', label: 'Detail', min: 2, max: 20, step: 1, decimals: 0 },
      { kind: 'mappedEnum', key: 'captype_start', label: 'Start cap', labels: CAP_LABELS },
      { kind: 'mappedEnum', key: 'captype_end', label: 'End cap', labels: CAP_LABELS },
      {
        kind: 'num',
        key: 'arrowheight',
        label: 'Arrow height',
        disabledWhen: or(isSimple, noArrow),
        min: 0,
        max: 5,
        step: 0.1,
        unit: 'Å',
      },
      {
        kind: 'num',
        key: 'arrowwidth',
        label: 'Arrow width',
        disabledWhen: or(isSimple, noArrow),
        min: 0,
        max: 5,
        step: 0.1,
      },
    ],
  },
  {
    key: 'atomintr-label',
    title: 'Value label',
    defaultExpanded: true,
    // The font only matters while the labels are drawn.
    disabledWhen: eq('showlabel', false),
    rows: [
      { kind: 'num', key: 'font_size', label: 'Font size', min: 1, max: 72, step: 1, decimals: 0, unit: 'pt' },
      { kind: 'text', key: 'font_name', label: 'Font name' },
      { kind: 'stringSelect', key: 'font_style', label: 'Font style', options: FONT_STYLE_OPTIONS },
      { kind: 'stringSelect', key: 'font_weight', label: 'Font weight', options: FONT_WEIGHT_OPTIONS },
    ],
  },
]
