/**
 * @file components/inspector/schema/ribbon.ts
 * @description The `ribbon` renderer's pages (C++ `molvis::RibbonRenderer`).
 *
 * It draws a classic secondary-structure ribbon (helix / sheet / coil) along
 * the main chain. Migrated from the UXP `ribbon-propdlg` tabs (Common / Helix /
 * Sheet / Coil). The per-structure section shapes live on nested `TubeSection`
 * objects (`helix` / `sheet` / `coil`) and the junctions on nested `JctTable`
 * objects (`helixhead` / `helixtail` / `sheethead` / `sheettail`), edited by
 * dotted keys.
 *
 * Parity notes (`ribbon-propdlg.js` / `ribbon-hsc-page.js`):
 *   - "Section detail" on the Common page writes the detail of all three
 *     sections in one undo step, and "Cap type" writes both ends.
 *   - Head and Tail are INDEPENDENT junctions here, each writing its own
 *     object -- unlike the cartoon helix, where one control writes both.
 *   - Sharpness applies to the "roundsquare" and "fancy1" types (the cartoon
 *     page gates the same row on roundsquare alone), which is why the two
 *     pages spell their section rows out separately rather than sharing them.
 *   - The back / side colour is editable only while its "use" flag is on.
 *   - Only properties present in the UXP dialog are exposed; the SplineRenderer
 *     base `smooth` and `line_width` are intentionally omitted.
 */

import { and, isOff, notOneOf, present } from './predicates'
import { junctionRows } from './shared/junction'
import {
  CAP_LABELS,
  SECTION_TYPE_LABELS,
  SECTION_TYPES_NO_FANCY,
  SHARP_TYPES,
} from './labels'
import type { PropRowDef, SchemaSectionDef } from './types'

/** Cap type option order matching the UXP single menulist. */
const CAP_TYPE_OPTIONS = ['flat', 'sphere', 'none']

interface RibbonSectionOpts {
  /** Offer the "fancy1" section type (helix / sheet; not coil). */
  allowFancy?: boolean
  /** An optional back / side colour: its use-flag key, colour key and label. */
  color?: { useKey: string; key: string; label: string }
}

/** One structure's shape rows: type, optional colour, width, tuber, sharpness, smoothness. */
function ribbonSectionRows(prefix: string, opts: RibbonSectionOpts = {}): PropRowDef[] {
  const rows: PropRowDef[] = [
    {
      kind: 'mappedEnum',
      key: `${prefix}.type`,
      label: 'Section type',
      labels: SECTION_TYPE_LABELS,
      options: opts.allowFancy ? undefined : SECTION_TYPES_NO_FANCY,
    },
  ]
  if (opts.color) {
    rows.push(
      { kind: 'bool', key: opts.color.useKey, label: `Use ${opts.color.label.toLowerCase()}` },
      {
        kind: 'color',
        key: opts.color.key,
        label: opts.color.label,
        // The colour is what the flag turns on, so it stays inert until then.
        disabledWhen: isOff(opts.color.useKey),
      },
    )
  }
  rows.push(
    { kind: 'num', key: `${prefix}.width`, label: 'Width', min: 0, max: 5, step: 0.05, decimals: 2, unit: 'Å' },
    { kind: 'num', key: `${prefix}.tuber`, label: 'Tuber', min: 0.2, max: 10, step: 0.1, decimals: 1 },
    {
      kind: 'num',
      key: `${prefix}.sharp`,
      label: 'Sharpness',
      // Only the square / fancy corners have a sharpness to speak of. A
      // section with no type at all is left alone.
      disabledWhen: and(present(`${prefix}.type`), notOneOf(`${prefix}.type`, SHARP_TYPES)),
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
    },
    { kind: 'num', key: `${prefix}_smooth`, label: 'Smoothness', min: 0, max: 0.5, step: 0.01, decimals: 2 },
  )
  return rows
}

/** The junction rows as the ribbon page names them: "Head ..." / "Tail ...". */
const jctLabels = (side: string) => ({
  type: `${side} type`,
  power: `${side} power`,
  arrowHeight: `${side} arrow height`,
  arrowWidth: `${side} arrow width`,
})

export const RIBBON_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'ribbon-main',
    title: 'Ribbon',
    defaultExpanded: true,
    rows: [
      {
        kind: 'multiNumInput',
        keys: ['coil.detail', 'helix.detail', 'sheet.detail'],
        label: 'Section detail',
        min: 2,
        max: 20,
        step: 1,
      },
      { kind: 'numInput', key: 'axialdetail', label: 'Axial detail', min: 2, max: 20, step: 1 },
      { kind: 'bool', key: 'smoothcolor', label: 'Smooth color' },
      { kind: 'text', key: 'pivotatom', label: 'Pivot atom name', placeholder: '(default)' },
      {
        kind: 'multiEnum',
        keys: ['start_captype', 'end_captype'],
        label: 'Cap type',
        labels: CAP_LABELS,
        options: CAP_TYPE_OPTIONS,
      },
      { kind: 'bool', key: 'segend_fade', label: 'Segment-end fade out' },
    ],
  },
  {
    key: 'ribbon-helix',
    title: 'Helix',
    defaultExpanded: true,
    rows: [
      ...ribbonSectionRows('helix', {
        allowFancy: true,
        color: { useKey: 'helix_usebackcol', key: 'helix_backcol', label: 'Back color' },
      }),
      ...junctionRows(['helixhead'], jctLabels('Head')),
      ...junctionRows(['helixtail'], jctLabels('Tail')),
    ],
  },
  {
    key: 'ribbon-sheet',
    title: 'Sheet',
    defaultExpanded: true,
    rows: [
      ...ribbonSectionRows('sheet', {
        allowFancy: true,
        color: { useKey: 'sheet_usesidecol', key: 'sheet_sidecol', label: 'Side color' },
      }),
      ...junctionRows(['sheethead'], jctLabels('Head')),
      ...junctionRows(['sheettail'], jctLabels('Tail')),
    ],
  },
  {
    key: 'ribbon-coil',
    title: 'Coil',
    defaultExpanded: true,
    rows: ribbonSectionRows('coil'),
  },
]
