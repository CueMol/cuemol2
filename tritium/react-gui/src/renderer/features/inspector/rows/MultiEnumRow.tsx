/**
 * @file features/inspector/rows/MultiEnumRow.tsx
 * @description An enum dropdown standing for several properties at once.
 *
 * The first target drives what the row displays and what its modified bar and
 * reset belong to; every target is written.
 */

import React from 'react'
import { PropertyField, SelectField } from '@renderer/h3-kit/form'
import { resetProps, type ResetFn, type SetFn } from './rowProps'
import { writeMany } from './multiWrite'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import type { RendererPropSectionProps } from '@renderer/features/inspector/rendererPropSections'

export interface MultiEnumRowProps {
  label: string
  /** The properties this control stands for; the first one drives the display. */
  targets: GenericPropEntry[]
  labels: Record<string, string>
  options?: string[]
  onSet: SetFn
  onSetMany: RendererPropSectionProps['onSetMany']
  onReset: ResetFn
  disabled?: boolean
}

export const MultiEnumRow: React.FC<MultiEnumRowProps> = ({
  label,
  targets,
  labels,
  options,
  onSet,
  onSetMany,
  onReset,
  disabled,
}) => {
  const primary = targets[0]
  const shown = options ?? primary.enumdef ?? [String(primary.value)]
  return (
    <PropertyField label={label} {...resetProps(primary, onReset)}>
      <SelectField
        value={String(primary.value)}
        disabled={disabled || primary.readonly}
        onChange={(v) => writeMany(targets, v, onSet, onSetMany)}
      >
        {shown.map((opt) => (
          <option key={opt} value={opt}>
            {labels[opt] ?? opt}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  )
}
