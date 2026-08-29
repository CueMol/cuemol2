/**
 * @file components/inspector/schema/disorder.ts
 * @description The `disorder` renderer page.
 *
 * The disorder overlay draws dotted loops along a main chain someone else is
 * already drawing, so its first row picks that renderer by name from the
 * molecule's siblings.
 *
 * The second loop size is optional: C++ falls back to the first unless it is
 * positive, so the row gates the number with a checkbox rather than asking the
 * user to type a negative one.
 *
 * Nothing previews while dragging: the rows commit on release / Enter.
 */

import type { SchemaSectionDef } from './types'

/**
 * Main-chain renderer types the overlay can follow (UXP parity). Kept in step
 * with `DISORDER_TARGET_TYPES` in the worker's `helpers/rendererNames.ts`,
 * which seeds this same target when the renderer is created; the two live on
 * opposite sides of the thread boundary and so cannot share the constant.
 */
const TARGET_TYPES = ['tube', 'ribbon', 'cartoon', 'nucl']

/** Loop-size bounds, shared by the two rows. */
const LOOP_MIN = 0
const LOOP_MAX = 10
const LOOP_STEP = 0.1

export const DISORDER_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'disorder-main',
    title: 'Disorder',
    defaultExpanded: true,
    rows: [
      {
        kind: 'asyncSelect',
        key: 'target',
        label: 'Target',
        source: { kind: 'siblingRenderers', typeNames: TARGET_TYPES },
        emptyOption: 'none',
      },
      { kind: 'numInput', key: 'detail', label: 'Detail', min: 2, max: 20, step: 1 },
      { kind: 'num', key: 'width', label: 'Dot size', min: 0, max: 3, step: 0.1, unit: 'Å' },
      { kind: 'num', key: 'dotsep', label: 'Dot separation', min: 0, max: 3, step: 0.1, unit: 'Å' },
      {
        kind: 'num',
        key: 'loopsize',
        label: 'Loop size',
        min: LOOP_MIN,
        max: LOOP_MAX,
        step: LOOP_STEP,
        unit: 'Å',
      },
      // C++ reads a non-positive loopsize2 as "no separate C-term size" and
      // falls back to loopsize, so the checkbox writes the -1.0 default to
      // turn it off rather than exposing the sentinel as a number.
      {
        kind: 'optionalNum',
        key: 'loopsize2',
        label: 'Loop size 2',
        gateLabel: 'Use a separate loop size 2',
        min: LOOP_MIN,
        max: LOOP_MAX,
        step: LOOP_STEP,
        unit: 'Å',
        offValue: -1,
        onValue: 2,
      },
      { kind: 'color', key: 'defaultcolor', label: 'Color' },
    ],
  },
]
