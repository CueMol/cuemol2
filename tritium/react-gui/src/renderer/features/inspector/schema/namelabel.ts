/**
 * @file features/inspector/schema/namelabel.ts
 * @description The `*namelabel` renderer's pages (C++ `NameLabelRenderer`).
 *
 * It draws the atom name labels as screen-space text, so the page has no
 * geometry rows (and the common page drops its edge lines, see common.ts).
 * There was no UXP dialog for it; the rows are curated from
 * `NameLabelRenderer.qif`.
 *
 *   - `format` is a C++ `LabelFormat` string such as "{resn}{resi} {name}".
 *     It is the DEFAULT text: a label carrying its own format (the console's
 *     `label` command sets one per atom) or its own text (a PSE label) keeps
 *     it, so editing this row changes only the labels without one. Empty
 *     means the built-in text, which the placeholder spells as a format.
 *   - `dispx` / `dispy` shift every label's anchor from its atom on screen,
 *     in pixels, so they preview while dragging. `halign` / `valign` choose
 *     which point of the label sits on that anchor (left / bottom by default,
 *     the placement before they existed).
 */

import { FONT_STYLE_OPTIONS, FONT_WEIGHT_OPTIONS } from './labels'
import type { SchemaSectionDef } from './types'

export const NAMELABEL_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'namelabel-main',
    title: 'Name label',
    defaultExpanded: true,
    rows: [
      { kind: 'text', key: 'format', label: 'Format', placeholder: '{chain} {resn}{resi} {name}' },
      { kind: 'color', key: 'color', label: 'Color' },
      { kind: 'bool', key: 'label_on_top', label: 'Label on top' },
      { kind: 'numInput', key: 'maxlabel', label: 'Max labels', min: 1, max: 1000, step: 1 },
      {
        kind: 'mappedEnum',
        key: 'halign',
        label: 'Horizontal align',
        labels: { left: 'Left', center: 'Center', right: 'Right' },
        options: ['left', 'center', 'right'],
      },
      {
        kind: 'mappedEnum',
        key: 'valign',
        label: 'Vertical align',
        labels: { top: 'Top', middle: 'Middle', bottom: 'Bottom' },
        options: ['top', 'middle', 'bottom'],
      },
      {
        kind: 'num',
        key: 'dispx',
        label: 'Offset X',
        min: -100,
        max: 100,
        step: 1,
        decimals: 0,
        unit: 'px',
        realtime: true,
      },
      {
        kind: 'num',
        key: 'dispy',
        label: 'Offset Y',
        min: -100,
        max: 100,
        step: 1,
        decimals: 0,
        unit: 'px',
        realtime: true,
      },
    ],
  },
  {
    key: 'namelabel-font',
    title: 'Font',
    defaultExpanded: true,
    rows: [
      { kind: 'num', key: 'font_size', label: 'Font size', min: 1, max: 72, step: 1, decimals: 0, unit: 'pt' },
      { kind: 'fontSelect', key: 'font_name', label: 'Font name' },
      { kind: 'stringSelect', key: 'font_style', label: 'Font style', options: FONT_STYLE_OPTIONS },
      { kind: 'stringSelect', key: 'font_weight', label: 'Font weight', options: FONT_WEIGHT_OPTIONS },
    ],
  },
]
