/**
 * @file components/inspector/rows/OptionalNumRow.tsx
 * @description A drag-numeric row whose property can also be "not set".
 *
 * Some C++ properties encode "unset" as a negative number rather than as a
 * separate flag: the disorder overlay's second loop size defaults to -1.0 and
 * `DisoRenderer::renderBezierDots` falls back to the first loop size unless it
 * is positive. Presenting that as a bare number asks the user to know that a
 * negative means something categorical, so the row pairs the field with a
 * checkbox and keeps the number in its meaningful range.
 *
 * Both halves write the SAME property, which is why they share one
 * `PropertyField`: the modified bar and the reset button stay attached to the
 * one property they describe.
 *
 * Turning the checkbox back on restores the last value the user set while it
 * was on; the first time (or after a reset) it falls back to `onValue`.
 */

import React, { useRef } from 'react'
import { DragNumericField, GatedControl, PropertyField } from '@renderer/h3-kit/form'
import { useRealtimeDragProp } from '@renderer/hooks/react/useRealtimeDragProp'
import { resetProps } from '../RendererCommonSection'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import type { RendererPropSectionProps } from '../rendererPropSections'

type SetFn = RendererPropSectionProps['onSet']
type ResetFn = RendererPropSectionProps['onReset']

export interface OptionalNumRowProps {
  entry: GenericPropEntry
  label: string
  /** Names what ticking the box does, for the checkbox's accessible name. */
  gateLabel: string
  min: number
  max: number
  step: number
  fineSnap?: number
  coarseSnap?: number
  unit?: string
  decimals?: number
  realtime?: boolean
  /** Written to turn the property off. Must be negative. */
  offValue: number
  /** Written when switched on with no remembered value. */
  onValue: number
  disabled?: boolean
  onSet: SetFn
  onReset: ResetFn
}

export const OptionalNumRow: React.FC<OptionalNumRowProps> = ({
  entry,
  label,
  gateLabel,
  min,
  max,
  step,
  fineSnap,
  coarseSnap,
  unit,
  decimals,
  realtime,
  offValue,
  onValue,
  disabled,
  onSet,
  onReset,
}) => {
  const committed = Number(entry.value)
  const on = committed >= 0
  // What to restore when the box is ticked again. Only updated while on, so
  // the sentinel never becomes the remembered value.
  const lastOnRef = useRef<number>(on ? committed : onValue)
  if (on) lastOnRef.current = committed

  const dragProps = useRealtimeDragProp({
    committed: on ? committed : lastOnRef.current,
    committedIsDefault: entry.isdefault,
    realtime,
    onPreview: (v) => onSet(entry.key, entry.type, v, { mode: 'preview' }),
    onCommit: (original, v, wasDefault) => {
      if (v === original) return
      if (realtime)
        onSet(entry.key, entry.type, v, {
          mode: 'commit',
          originalValue: original,
          originalWasDefault: wasDefault,
        })
      else onSet(entry.key, entry.type, v)
    },
    onAbort: (original, wasDefault) =>
      onSet(entry.key, entry.type, original, {
        mode: 'abort',
        originalWasDefault: wasDefault,
      }),
  })

  const fieldDisabled = disabled || entry.readonly
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <GatedControl
        checked={on}
        disabled={fieldDisabled}
        ariaLabel={gateLabel}
        onCheckedChange={(next) =>
          onSet(entry.key, entry.type, next ? lastOnRef.current : offValue)
        }
      >
        <DragNumericField
          {...dragProps}
          min={min}
          max={max}
          step={step}
          fineSnap={fineSnap}
          coarseSnap={coarseSnap}
          unit={unit}
          decimals={decimals}
          disabled={fieldDisabled || !on}
        />
      </GatedControl>
    </PropertyField>
  )
}
