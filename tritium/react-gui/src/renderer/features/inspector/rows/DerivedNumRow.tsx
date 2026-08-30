/**
 * @file features/inspector/rows/DerivedNumRow.tsx
 * @description A numeric row whose value is computed from several properties.
 *
 * C++ sometimes stores a size in units the user does not think in. A tube's
 * cross-section is a major axis plus a minor/major ratio, so showing the two
 * axes as independent sizes means recomputing the ratio whenever the major
 * axis moves -- otherwise editing one axis silently resizes the other. A
 * nucleic base's thickness is an absolute that the UXP dialog showed as a
 * percentage of the base size.
 *
 * The row therefore takes the value to display and a function turning a
 * committed value into writes, rather than an entry to read and write
 * directly. The entry it does take is the one the modified bar and the reset
 * button belong to.
 *
 * A single write goes through `onSet`, several through `onSetMany` so they
 * land in one undo step.
 */

import React from 'react'
import { DragNumericField, PropertyField } from '@renderer/h3-kit/form'
import { useRealtimeDragProp } from '@renderer/hooks/react/useRealtimeDragProp'
import { resetProps, type ResetFn, type SetFn } from './rowProps'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import type { PropMultiWrite, RendererPropSectionProps } from '@renderer/features/inspector/rendererPropSections'

export interface DerivedNumRowProps {
  /** The property the modified bar and reset belong to. */
  entry: GenericPropEntry
  label: string
  /** The value to show, already in the user's unit. */
  value: number
  /** The writes a committed value turns into; empty means write nothing. */
  computeWrites: (value: number) => PropMultiWrite[]
  min: number
  max: number
  step: number
  fineSnap?: number
  coarseSnap?: number
  unit?: string
  decimals?: number
  /** The row can write several properties, so it needs `onSetMany` to work. */
  multiWrite?: boolean
  disabled?: boolean
  onSet: SetFn
  onSetMany: RendererPropSectionProps['onSetMany']
  onReset: ResetFn
}

export const DerivedNumRow: React.FC<DerivedNumRowProps> = ({
  entry,
  label,
  value,
  computeWrites,
  min,
  max,
  step,
  fineSnap,
  coarseSnap,
  unit,
  decimals,
  multiWrite,
  disabled,
  onSet,
  onSetMany,
  onReset,
}) => {
  const dragProps = useRealtimeDragProp({
    committed: value,
    committedIsDefault: entry.isdefault,
    realtime: false,
    onPreview: () => {},
    onCommit: (original, v) => {
      if (v === original) return
      const writes = computeWrites(v)
      if (writes.length === 0) return
      if (writes.length === 1) {
        const [w] = writes
        onSet(w.key, w.valueType, w.value)
      } else {
        onSetMany?.(writes)
      }
    },
  })
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <DragNumericField
        {...dragProps}
        min={min}
        max={max}
        step={step}
        fineSnap={fineSnap}
        coarseSnap={coarseSnap}
        unit={unit}
        decimals={decimals}
        disabled={disabled || entry.readonly || (multiWrite === true && !onSetMany)}
      />
    </PropertyField>
  )
}
