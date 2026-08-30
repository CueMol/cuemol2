/**
 * @file components/inspector/schema/shared/junction.ts
 * @description The rows of a `JctTable` junction, shared by cartoon and ribbon.
 *
 * A junction is how a secondary-structure element ends: rounded, flat, or an
 * arrow head. Both renderers expose the same four properties for it, and both
 * dialogs presented them the same way, so the rows are written once.
 *
 * The two arrow sizes are the reason this is not four literal rows: C++ stores
 * the height as the width of the arrow's base relative to the ribbon (1 = no
 * arrow) and the width as a multiple of the ribbon width, while the dialogs
 * show both as percentages. The conversions are here so the two callers cannot
 * disagree about them.
 *
 * What differs between the callers is only how many objects one control writes
 * (a cartoon helix sets head and tail together) and what the rows are called,
 * so those are the parameters.
 */

import { neq } from '@renderer/features/inspector/schema/predicates'
import { JCT_TYPE_LABELS, JCT_TYPE_OPTIONS } from '@renderer/features/inspector/schema/labels'
import type { PropRowDef } from '@renderer/features/inspector/schema/types'

/** Arrow height: stored as the base width, 1 meaning no arrow at all. */
const arrowHeight = {
  toDisplay: (stored: number) => (1 - stored) * 100,
  toStored: (display: number) => (100 - display) / 100,
}
/** Arrow width: stored as a multiple of the ribbon width. */
const arrowWidth = {
  toDisplay: (stored: number) => (stored - 1) * 50,
  toStored: (display: number) => display / 50 + 1,
}

export interface JunctionLabels {
  type: string
  power: string
  arrowHeight: string
  arrowWidth: string
}

/**
 * The four rows of one junction, written to every object in `prefixes`.
 *
 * @param prefixes - `JctTable` key prefixes; one control writes them all.
 * @param labels - How the rows read on this page.
 */
export function junctionRows(prefixes: string[], labels: JunctionLabels): PropRowDef[] {
  const keys = (field: string): string[] => prefixes.map((p) => `${p}.${field}`)
  // The arrow sizes describe an arrow, so they only apply to that type. An
  // absent type counts as not-an-arrow, as it did before the schema.
  const notArrow = neq(`${prefixes[0]}.type`, 'arrow')
  return [
    {
      kind: 'multiEnum',
      keys: keys('type'),
      label: labels.type,
      labels: JCT_TYPE_LABELS,
      options: JCT_TYPE_OPTIONS,
    },
    {
      kind: 'multiNum',
      keys: keys('gamma'),
      label: labels.power,
      min: 0.1,
      max: 10,
      step: 0.1,
      decimals: 2,
    },
    {
      kind: 'multiNum',
      keys: keys('basw'),
      label: labels.arrowHeight,
      min: 0,
      max: 100,
      step: 10,
      decimals: 0,
      unit: '%',
      disabledWhen: notArrow,
      ...arrowHeight,
    },
    {
      kind: 'multiNum',
      keys: keys('arrow'),
      label: labels.arrowWidth,
      min: 0,
      max: 100,
      step: 10,
      decimals: 0,
      unit: '%',
      disabledWhen: notArrow,
      ...arrowWidth,
    },
  ]
}
