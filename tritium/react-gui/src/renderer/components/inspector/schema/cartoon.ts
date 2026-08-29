/**
 * @file components/inspector/schema/cartoon.ts
 * @description The `cartoon` renderer's pages (C++ `Ribbon2Renderer`).
 *
 * It draws ribbon / tube secondary-structure cartoons (helix / sheet / coil)
 * along the main chain. Migrated from the UXP `cartoon-propdlg` tabs (Cartoon /
 * Helix / Sheet / Coil), including the per-structure SHAPE controls that live
 * on nested sub-objects: each of `helix` / `sheet` / `coil` / `ribhelix` is a
 * `TubeSection` and each of `sheethead` / `ribhelix_head` / `ribhelix_tail` is
 * a `JctTable`, reached by dotted keys (`helix.width`, `sheethead.gamma`, ...).
 * `parseGenericProps` expands the nested objects and `setProp` routes the
 * dotted path through `LPropSupport::setNestedProperty` (ADR-0015).
 *
 * Parity notes (UXP `cartoon-hsc-page.js`):
 *   - The Helix page is a deck switched by `helix_ribbon` (Cylinder vs
 *     Ribbon); only the active deck's rows are shown, matching the UXP
 *     `<deck>`. That is what the `group` rows are.
 *   - The ribbon head/tail controls write BOTH `ribhelix_head.*` and
 *     `ribhelix_tail.*` in one undo step (UXP writes both); the sheet head
 *     writes the single `sheethead.*`.
 *   - Section sharpness applies only to the "roundsquare" type here (the
 *     ribbon section is not gated at all). Ribbon's page gates the same row on
 *     roundsquare OR fancy1, which is why the two pages spell it out
 *     separately rather than sharing a section-shape helper.
 *   - `helix_waver` (nopersist) and `dump_curvature` (debug) are intentionally
 *     not surfaced (they are not in the UXP dialog).
 */

import { absent, and, isOff, isOn, neq, oneOf, or, present } from './predicates'
import { junctionRows } from './shared/junction'
import {
  CAP_LABELS,
  SECTION_TYPE_LABELS,
  SECTION_TYPES_NO_FANCY,
} from './labels'
import type { PropRowDef, SchemaSectionDef } from './types'

const HELIX_WIDTH_MODE_LABELS: Record<string, string> = {
  const: 'Constant',
  average: 'Average',
  wavy: 'Wavy',
}

interface SectionShapeOpts {
  /** Offer the "fancy1" section type (the ribbon section only). */
  allowFancy?: boolean
  /** Expose the width row (omitted for the cylinder-helix section). */
  width?: { max: number }
  detail: { min: number; max: number }
  /** Gate sharpness on the "roundsquare" type (off for the ribbon section). */
  gateSharp?: boolean
}

/**
 * The `TubeSection` shape rows of one secondary structure, read by dotted keys
 * `${prefix}.*`.
 */
function sectionShapeRows(prefix: string, opts: SectionShapeOpts): PropRowDef[] {
  const rows: PropRowDef[] = [
    {
      kind: 'mappedEnum',
      key: `${prefix}.type`,
      label: 'Section type',
      labels: SECTION_TYPE_LABELS,
      options: opts.allowFancy ? undefined : SECTION_TYPES_NO_FANCY,
    },
    {
      kind: 'numInput',
      key: `${prefix}.detail`,
      label: 'Section detail',
      min: opts.detail.min,
      max: opts.detail.max,
      step: 1,
    },
  ]
  if (opts.width) {
    rows.push({
      kind: 'num',
      key: `${prefix}.width`,
      label: 'Section width',
      min: 0,
      max: opts.width.max,
      step: 0.05,
      decimals: 2,
      unit: 'Å',
    })
  }
  rows.push(
    { kind: 'num', key: `${prefix}.tuber`, label: 'Tuber', min: 0.2, max: 10, step: 0.1, decimals: 1 },
    {
      kind: 'num',
      key: `${prefix}.sharp`,
      label: 'Sharpness',
      // Only rounded-square corners have a sharpness to speak of. A section
      // with no type at all is left alone.
      disabledWhen: opts.gateSharp
        ? and(present(`${prefix}.type`), neq(`${prefix}.type`, 'roundsquare'))
        : undefined,
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
    },
  )
  return rows
}

/** The junction rows as the cartoon page names them. */
const CARTOON_JCT_LABELS = {
  type: 'Cap type',
  power: 'Cap power',
  arrowHeight: 'Arrow height',
  arrowWidth: 'Arrow width',
}

/** Every structure page opens with the same spline-smoothing row. */
const smoothingRow = (key: string): PropRowDef => ({
  kind: 'num',
  key,
  label: 'Smoothing',
  min: -5,
  max: 5,
  step: 0.1,
  decimals: 1,
})

export const CARTOON_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'cartoon-main',
    title: 'Cartoon',
    defaultExpanded: true,
    rows: [
      { kind: 'numInput', key: 'axialdetail', label: 'Axial detail', min: 2, max: 20, step: 1 },
      { kind: 'bool', key: 'smoothcolor', label: 'Smooth color' },
      { kind: 'text', key: 'pivotatom', label: 'Pivot atom name', placeholder: '(default)' },
      { kind: 'mappedEnum', key: 'start_captype', label: 'Start cap', labels: CAP_LABELS },
      { kind: 'mappedEnum', key: 'end_captype', label: 'End cap', labels: CAP_LABELS },
      { kind: 'sel', key: 'anchor_sel', label: 'Anchor selection' },
      {
        kind: 'num',
        key: 'anchor_weight',
        label: 'Anchor weight',
        // The weight is how hard the spline is pulled towards the anchor, so
        // it means nothing until something is anchored.
        disabledWhen: or(absent('anchor_sel'), oneOf('anchor_sel', ['', 'none'])),
        min: 0,
        max: 20,
        step: 1,
        decimals: 1,
      },
    ],
  },
  {
    key: 'cartoon-helix',
    title: 'Helix',
    defaultExpanded: true,
    rows: [
      {
        kind: 'boolSelect',
        key: 'helix_ribbon',
        label: 'Type',
        offOption: { value: 'cylinder', label: 'Cylinder' },
        onOption: { value: 'ribbon', label: 'Ribbon' },
      },
      {
        kind: 'group',
        visibleWhen: isOn('helix_ribbon'),
        rows: [
          ...sectionShapeRows('ribhelix', {
            allowFancy: true,
            width: { max: 5 },
            detail: { min: 4, max: 20 },
          }),
          ...junctionRows(['ribhelix_head', 'ribhelix_tail'], CARTOON_JCT_LABELS),
        ],
      },
      {
        kind: 'group',
        visibleWhen: isOff('helix_ribbon'),
        rows: [
          smoothingRow('helix_smooth'),
          { kind: 'num', key: 'helix_extend', label: 'Extend', min: 0, max: 3, step: 0.05, decimals: 2, unit: 'Å' },
          ...sectionShapeRows('helix', { detail: { min: 4, max: 50 }, gateSharp: true }),
          {
            kind: 'mappedEnum',
            key: 'helix_width_mode',
            label: 'Width mode',
            labels: HELIX_WIDTH_MODE_LABELS,
          },
          { kind: 'num', key: 'helix_wplus', label: 'Add width', min: -2, max: 3, step: 0.05, decimals: 2, unit: 'Å' },
          {
            kind: 'num',
            key: 'helix_wsmooth',
            label: 'Width smooth',
            // Only the wavy mode has a width per residue to smooth. With no
            // mode property at all the page behaves as its "average" default,
            // which is not wavy either.
            disabledWhen: neq('helix_width_mode', 'wavy'),
            min: -5,
            max: 5,
            step: 0.1,
            decimals: 1,
          },
        ],
      },
    ],
  },
  {
    key: 'cartoon-sheet',
    title: 'Sheet',
    defaultExpanded: true,
    rows: [
      smoothingRow('sheet_smooth'),
      ...sectionShapeRows('sheet', {
        width: { max: 3 },
        detail: { min: 2, max: 20 },
        gateSharp: true,
      }),
      { kind: 'num', key: 'sheet_wsmooth', label: 'Width smooth', min: -5, max: 5, step: 0.1, decimals: 1 },
      ...junctionRows(['sheethead'], CARTOON_JCT_LABELS),
    ],
  },
  {
    key: 'cartoon-coil',
    title: 'Coil',
    defaultExpanded: true,
    rows: [
      smoothingRow('coil_smooth'),
      ...sectionShapeRows('coil', {
        width: { max: 3 },
        detail: { min: 4, max: 20 },
        gateSharp: true,
      }),
    ],
  },
]
