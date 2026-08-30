/**
 * @file components/inspector/rows/MultiNumRow.tsx
 * @description A drag-numeric row standing for several properties at once,
 * optionally in a unit of its own.
 *
 * Two things travel together here because they are the same row in the UXP
 * dialogs: writing a value to more than one nested object (a cartoon helix's
 * head and tail), and showing a stored value as something else (a junction's
 * arrow height is stored as a base width and shown as a percentage). Either
 * can be used alone -- one target with a transform is the percentage row, and
 * several targets without one is the plain shared slider.
 *
 * The first target drives the displayed value, the modified bar and the reset.
 */

import React from 'react'
import { DragNumericField, PropertyField } from '@renderer/h3-kit/form'
import { useRealtimeDragProp } from '@renderer/hooks/react/useRealtimeDragProp'
import { resetProps, type ResetFn, type SetFn } from './rowProps'
import { writeMany } from './multiWrite'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import type { RendererPropSectionProps } from '../rendererPropSections'

export interface MultiNumRowProps {
  label: string
  /** The properties this control stands for; the first one drives the display. */
  targets: GenericPropEntry[]
  min: number
  max: number
  step: number
  decimals?: number
  unit?: string
  /** Stored value -> displayed value (default identity). */
  toDisplay?: (stored: number) => number
  /** Displayed value -> stored value (default identity). */
  toStored?: (display: number) => number
  onSet: SetFn
  onSetMany: RendererPropSectionProps['onSetMany']
  onReset: ResetFn
  disabled?: boolean
}

export const MultiNumRow: React.FC<MultiNumRowProps> = ({
  label,
  targets,
  min,
  max,
  step,
  decimals,
  unit,
  toDisplay = (s) => s,
  toStored = (d) => d,
  onSet,
  onSetMany,
  onReset,
  disabled,
}) => {
  const primary = targets[0]
  const dragProps = useRealtimeDragProp({
    committed: toDisplay(Number(primary.value)),
    committedIsDefault: primary.isdefault,
    realtime: false,
    onPreview: () => {},
    onCommit: (original, v) => {
      if (v === original) return
      writeMany(targets, toStored(v), onSet, onSetMany)
    },
  })
  return (
    <PropertyField label={label} {...resetProps(primary, onReset)}>
      <DragNumericField
        {...dragProps}
        min={min}
        max={max}
        step={step}
        decimals={decimals}
        unit={unit}
        disabled={disabled || primary.readonly}
      />
    </PropertyField>
  )
}
