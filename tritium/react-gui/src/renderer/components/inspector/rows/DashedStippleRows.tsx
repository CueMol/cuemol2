/**
 * @file components/inspector/rows/DashedStippleRows.tsx
 * @description The atom-interaction renderer's dash-pattern block.
 *
 * This is not a property row, which is why it is a block: there is no "dashed"
 * property at all. A line is dashed when any of the six `stipple0..5` lengths
 * is non-negative, so the toggle is synthetic -- switching it off writes -1 to
 * all six, switching it on restores a single dash / gap pair -- and the whole
 * rewrite has to be one undo step. Below it the six lengths are laid out as
 * dash / gap pairs rather than as six numbered rows, which is how the UXP
 * groupbox read.
 *
 * The layout is the reason this stays a component rather than becoming rows in
 * a schema: a row of compact cells with captions is a shape the row catalog
 * does not have and only this page wants.
 */

import React from 'react'
import { Field, NumberCell, SwitchField } from '@renderer/h3-kit/form'
import type { CustomRowProps } from '../schema/types'

/** Stipple pattern keys in dash / gap order. */
const STIPPLE_KEYS = [
  'stipple0',
  'stipple1',
  'stipple2',
  'stipple3',
  'stipple4',
  'stipple5',
]

/** Restored pattern when the line is switched to dashed: one dash / gap pair. */
const DASHED_ON_VALUE: Record<string, number> = { stipple0: 1, stipple1: 1 }

/** A negative stipple is the "unused segment" sentinel; show it as blank. */
function stippleDisplay(value: number): string {
  return value >= 0 ? String(value) : ''
}

/** Parse a cell's text back to a stipple value; blank / negative -> -1. */
function parseStipple(raw: string): number {
  const n = parseFloat(raw)
  return raw.trim() === '' || isNaN(n) || n < 0 ? -1 : n
}

export const DashedStippleRows: React.FC<CustomRowProps> = ({ ctx, onSet, onSetMany }) => {
  const present = STIPPLE_KEYS.map((k) => ctx.get(k)).filter((e) => e !== undefined)
  if (present.length === 0) return null

  const dashedOn = present.some((s) => Number(s.value) >= 0)

  const onToggleDashed = (checked: boolean): void => {
    if (!onSetMany) return
    onSetMany(
      present.map((s) => ({
        key: s.key,
        valueType: s.type,
        value: checked ? (DASHED_ON_VALUE[s.key] ?? -1) : -1,
      })),
    )
  }

  return (
    <>
      <Field label="Dashed" inline>
        <SwitchField checked={dashedOn} onChange={onToggleDashed} />
      </Field>
      <div className="atomintr-stipple-row" role="group" aria-label="Dash pattern">
        {STIPPLE_KEYS.map((key, i) => {
          const s = ctx.get(key)
          if (!s) return null
          const caption = i % 2 === 0 ? 'dash' : 'gap'
          const value = Number(s.value)
          return (
            <div className="atomintr-stipple-cell" key={key}>
              <NumberCell
                value={stippleDisplay(value)}
                disabled={!dashedOn}
                aria-label={`${caption} ${Math.floor(i / 2) + 1}`}
                onCommit={(raw) => {
                  const next = parseStipple(raw)
                  if (next !== value) onSet(s.key, s.type, next)
                }}
              />
              <span className="atomintr-stipple-caption type-caption">{caption}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}
