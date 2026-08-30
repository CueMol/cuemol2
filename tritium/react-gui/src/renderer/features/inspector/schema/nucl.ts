/**
 * @file features/inspector/schema/nucl.ts
 * @description The `nucl` renderer's page (C++ `molvis::NARenderer`).
 *
 * It draws a backbone tube plus base sticks / cylinders along nucleic-acid
 * chains. NARenderer extends TubeRenderer, so the UXP `nucl-propdlg` stacks a
 * "Nucleic acid" tab on top of the shared tube page; here the base controls
 * are this file and the tube pages come from `schema/tube`, gated on the same
 * "Show tube" flag the UXP dialog gates them on.
 *
 * Parity note: `base_thick` is stored as an absolute real, but the UXP slider
 * shows it as a percentage of `base_size` (`thick * 100 / base_size`) and
 * writes back `pct * base_size / 100` (`nucl-propdlg.js` L78 / L121-125), so
 * the row is derived like the tube's Width2. The two are one pair: resizing
 * the base rescales the thickness with it, exactly as a tube's major axis
 * rewrites the ratio that holds its minor one.
 */

import { NUCL_TUBE_SECTIONS } from './tube'
import type { PropCtx, SchemaSectionDef } from './types'
import type { PropMultiWrite } from '@renderer/features/inspector/rendererPropSections'

/**
 * The base size is the divisor of the thickness percentage, so zero would
 * leave that row with nothing to be a percentage of; the lower bound is one
 * step above it.
 */
const SIZE_MIN = 0.1

const num = (ctx: PropCtx, key: string): number => Number(ctx.value(key))

/**
 * The base-rendering controls. Never gated by "Show tube" -- that flag lives
 * here and only disables the inherited tube pages.
 */
const NUCL_BASE_SECTION: SchemaSectionDef = {
  key: 'nucl-base',
  title: 'Nucleic acid',
  defaultExpanded: true,
  rows: [
    { kind: 'bool', key: 'show_tube', label: 'Show tube' },
    { kind: 'bool', key: 'show_basepair', label: 'Connect base pair' },
    { kind: 'enum', key: 'base_type', label: 'Base type' },
    { kind: 'numEnum', keys: ['base_detail'], label: 'Detail', min: 2 },
    {
      kind: 'derivedNum',
      key: 'base_size',
      label: 'Base size',
      needs: [],
      display: (ctx) => num(ctx, 'base_size'),
      // Scale the thickness with the size so the percentage the other row
      // shows stays put -- otherwise shrinking the base leaves an absolute
      // thickness that reads as more than 100 % of it.
      commit: (ctx, v) => {
        if (!(v > 0)) return []
        const size = ctx.get('base_size')!
        const writes: PropMultiWrite[] = [{ key: size.key, valueType: size.type, value: v }]
        const thick = ctx.get('base_thick')
        const oldSize = num(ctx, 'base_size')
        if (thick && oldSize > 0) {
          writes.push({
            key: thick.key,
            valueType: thick.type,
            value: (Number(thick.value) * v) / oldSize,
          })
        }
        return writes
      },
      multiWrite: true,
      min: SIZE_MIN,
      max: 3,
      step: 0.1,
      decimals: 1,
      unit: 'Å',
    },
    {
      kind: 'derivedNum',
      key: 'base_thick',
      label: 'Base thick',
      needs: ['base_size'],
      display: (ctx) => {
        const size = num(ctx, 'base_size')
        return size > 0 ? (num(ctx, 'base_thick') * 100) / size : 0
      },
      commit: (ctx, v) => {
        const size = num(ctx, 'base_size')
        if (!(size > 0)) return []
        return [
          { key: 'base_thick', valueType: ctx.get('base_thick')!.type, value: (v * size) / 100 },
        ]
      },
      min: 0,
      max: 100,
      step: 10,
      decimals: 1,
      unit: '%',
    },
  ],
}

export const NUCL_SECTIONS: SchemaSectionDef[] = [
  NUCL_BASE_SECTION,
  ...NUCL_TUBE_SECTIONS,
]
