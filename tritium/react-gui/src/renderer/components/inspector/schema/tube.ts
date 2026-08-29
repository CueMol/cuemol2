/**
 * @file components/inspector/schema/tube.ts
 * @description The `tube` renderer's pages, and the same pages for `nucl`.
 *
 * Migrated from the UXP `tube-propdlg` "Tube" tab, which the `nucl-propdlg`
 * also overlays (NARenderer extends TubeRenderer, so the backbone /
 * cross-section / putty properties are inherited unchanged). The pages are
 * built by `tubeSections`, so nucl reuses them rather than re-declaring them,
 * and gates the whole set on its "Show tube" flag (UXP `gTube.disableAll`).
 *
 * Parity / scope notes:
 *   - The cross-section shape lives on the renderer's nested `section`
 *     (`TubeSection`) object and is written through dot-path keys
 *     (`section.type`, `section.width`, ...). `parseGenericProps` expands the
 *     children and `cuemol2::setProp` routes dot-paths through
 *     `LPropSupport::setNestedProperty`, so these are first-class editable.
 *   - Width1 / Width2 are the two cross-section axis sizes in Angstroms, edited
 *     independently like the UXP tube page. They map onto the stored major-size
 *     + ratio pair, which is what makes them `derivedNum` rows (see below).
 *   - UXP uses a single "Cap type" control writing both start and end; here the
 *     two cap-type properties are separate rows, matching the sibling cartoon
 *     page and keeping per-property reset clean.
 *   - `pivotatom` empty falls back to the per-polymer default pivot atom
 *     resolved by the C++ side (shown via a "(default)" placeholder). The UXP
 *     checkbox + textbox combo is replaced by the standard modified bar / reset.
 *   - Nothing previews while dragging: the rows commit on release / Enter.
 */

import { and, eq, notOneOf, present } from './predicates'
import { CAP_LABELS, SECTION_TYPE_LABELS, SHARP_TYPES } from './labels'
import type { Predicate, PropCtx, SchemaSectionDef } from './types'
import type { PropMultiWrite } from '../rendererPropSections'

const PUTTY_MODE_LABELS: Record<string, string> = {
  none: 'None',
  linear1: 'Linear',
  scale1: 'Scale',
}
/**
 * Reading order: off, then the two ways of scaling. The `enumdef` C++ reports
 * is alphabetical, which would put Linear before None.
 */
const PUTTY_MODE_OPTIONS = ['none', 'linear1', 'scale1']
const PUTTY_TGT_LABELS: Record<string, string> = {
  bfac: 'B-factor',
  occ: 'Occupancy',
}

// The cross-section is stored as `section.width` (the major-axis size in A)
// and `section.tuber` (the minor/major ratio). The UI presents two independent
// direct axis sizes, matching the UXP tube page:
//   Width1 = major axis = section.width
//   Width2 = minor axis = section.tuber * section.width
// Editing one axis must NOT move the other, so:
//   - Width1 -> W1': section.width = W1', section.tuber = (tuber*width) / W1'
//     (preserves Width2; one undo step through the multi-write).
//   - Width2 -> W2': section.tuber = W2' / width (section.width unchanged, so
//     Width1 is preserved).
const num = (ctx: PropCtx, key: string): number => Number(ctx.value(key))

/**
 * Axis-size bounds. The lower bound is one step above zero rather than zero: a
 * cross-section with a zero axis has no width to draw, and the ratio the other
 * axis is stored as would divide by it.
 */
const AXIS_MIN = 0.01
const AXIS_MAX = 3
const AXIS_STEP = 0.01

/**
 * The tube pages. `disabledWhen`, when given, disables all three at once --
 * which is what the nucl renderer's "Show tube" flag does.
 */
export function tubeSections(disabledWhen?: Predicate): SchemaSectionDef[] {
  return [
    {
      key: 'tube-main',
      title: 'Tube',
      defaultExpanded: true,
      disabledWhen,
      rows: [
        { kind: 'numEnum', keys: ['axialdetail'], label: 'Axial detail', min: 2, max: 20 },
        { kind: 'num', key: 'smooth', label: 'Smoothness', min: 0, max: 0.5, step: 0.01, decimals: 2 },
        { kind: 'bool', key: 'smoothcolor', label: 'Smooth color' },
        { kind: 'mappedEnum', key: 'start_captype', label: 'Start cap', labels: CAP_LABELS },
        { kind: 'mappedEnum', key: 'end_captype', label: 'End cap', labels: CAP_LABELS },
        { kind: 'bool', key: 'segend_fade', label: 'Segment-end fade out' },
        { kind: 'text', key: 'pivotatom', label: 'Pivot atom name', placeholder: '(default)' },
      ],
    },
    {
      key: 'tube-section',
      title: 'Section',
      defaultExpanded: true,
      disabledWhen,
      rows: [
        { kind: 'mappedEnum', key: 'section.type', label: 'Type', labels: SECTION_TYPE_LABELS },
        { kind: 'numEnum', keys: ['section.detail'], label: 'Detail', min: 2, max: 20 },
        {
          kind: 'derivedNum',
          key: 'section.width',
          label: 'Width1',
          needs: [],
          display: (ctx) => num(ctx, 'section.width'),
          // Rewrite the ratio so the minor axis keeps the size it shows. With
          // no ratio stored there is no minor axis to keep, and the major one
          // is written on its own.
          commit: (ctx, v) => {
            if (!(v > 0)) return []
            const width = ctx.get('section.width')!
            const writes: PropMultiWrite[] = [
              { key: width.key, valueType: width.type, value: v },
            ]
            const tuber = ctx.get('section.tuber')
            if (tuber) {
              const minor = Number(tuber.value) * num(ctx, 'section.width')
              writes.push({ key: tuber.key, valueType: tuber.type, value: minor / v })
            }
            return writes
          },
          multiWrite: true,
          min: AXIS_MIN,
          max: AXIS_MAX,
          step: AXIS_STEP,
          decimals: 2,
          unit: 'Å',
        },
        {
          kind: 'derivedNum',
          key: 'section.tuber',
          label: 'Width2',
          needs: ['section.width'],
          display: (ctx) => num(ctx, 'section.tuber') * num(ctx, 'section.width'),
          commit: (ctx, v) => {
            const width = num(ctx, 'section.width')
            if (!(width > 0)) return []
            return [
              { key: 'section.tuber', valueType: ctx.get('section.tuber')!.type, value: v / width },
            ]
          },
          min: AXIS_MIN,
          max: AXIS_MAX,
          step: AXIS_STEP,
          decimals: 2,
          unit: 'Å',
        },
        {
          kind: 'num',
          key: 'section.sharp',
          label: 'Sharpness',
          // Only the square / fancy corners have a sharpness to speak of (UXP
          // updateDisabledState). A section with no type at all is left alone.
          disabledWhen: and(present('section.type'), notOneOf('section.type', SHARP_TYPES)),
          min: 0,
          max: 1,
          step: 0.05,
          decimals: 2,
        },
      ],
    },
    {
      key: 'tube-putty',
      title: 'Putty',
      defaultExpanded: true,
      disabledWhen,
      rows: [
        {
          kind: 'mappedEnum',
          key: 'putty_mode',
          label: 'Mode',
          labels: PUTTY_MODE_LABELS,
          options: PUTTY_MODE_OPTIONS,
        },
        {
          kind: 'mappedEnum',
          key: 'putty_tgt',
          label: 'Target',
          labels: PUTTY_TGT_LABELS,
          disabledWhen: eq('putty_mode', 'none'),
        },
        {
          kind: 'num',
          key: 'putty_loscl',
          label: 'Low scale',
          disabledWhen: eq('putty_mode', 'none'),
          min: 0.1,
          max: 10,
          step: 0.1,
          decimals: 1,
        },
        {
          kind: 'num',
          key: 'putty_hiscl',
          label: 'High scale',
          disabledWhen: eq('putty_mode', 'none'),
          min: 0.1,
          max: 10,
          step: 0.1,
          decimals: 1,
        },
      ],
    },
  ]
}

export const TUBE_SECTIONS: SchemaSectionDef[] = tubeSections()

/**
 * The same pages for the nucleic-acid renderer, disabled while "Show tube" is
 * off. A nucl renderer always has the flag; a host without it leaves the
 * sections enabled rather than dead.
 */
export const NUCL_TUBE_SECTIONS: SchemaSectionDef[] = tubeSections(eq('show_tube', false))
