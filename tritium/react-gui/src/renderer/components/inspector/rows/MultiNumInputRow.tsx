/**
 * @file components/inspector/rows/MultiNumInputRow.tsx
 * @description A stepper standing for several integer properties at once
 * (a ribbon's "Section detail", which sets all three sections).
 *
 * The first target drives the displayed value, the modified bar and the reset.
 * The local draft resyncs when the committed value changes, which the engine
 * arranges by remounting the row on its value.
 */

import React, { useState } from 'react'
import { NumericField, PropertyField } from '@renderer/h3-kit/form'
import { resetProps, type ResetFn, type SetFn } from './rowProps'
import { writeMany } from './multiWrite'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import type { RendererPropSectionProps } from '../rendererPropSections'

export interface MultiNumInputRowProps {
  label: string
  /** The properties this control stands for; the first one drives the display. */
  targets: GenericPropEntry[]
  min: number
  max: number
  step: number
  onSet: SetFn
  onSetMany: RendererPropSectionProps['onSetMany']
  onReset: ResetFn
  disabled?: boolean
}

export const MultiNumInputRow: React.FC<MultiNumInputRowProps> = ({
  label,
  targets,
  min,
  max,
  step,
  onSet,
  onSetMany,
  onReset,
  disabled,
}) => {
  const primary = targets[0]
  const [draft, setDraft] = useState(Number(primary.value))
  const commit = (v: number) => {
    if (v !== Number(primary.value)) writeMany(targets, v, onSet, onSetMany)
  }
  return (
    <PropertyField label={label} inline {...resetProps(primary, onReset)}>
      <NumericField
        value={draft}
        onChange={setDraft}
        onRelease={commit}
        slider={false}
        min={min}
        max={max}
        step={step}
        disabled={disabled || primary.readonly}
      />
    </PropertyField>
  )
}
