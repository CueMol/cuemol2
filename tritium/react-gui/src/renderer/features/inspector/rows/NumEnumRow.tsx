/**
 * @file features/inspector/rows/NumEnumRow.tsx
 * @description An integer property chosen from a ladder rather than typed.
 *
 * For a tessellation level. What the eye sees is the difference between 4 and
 * 8, not between 8 and 9, so offering every integer asks for a precision the
 * value does not have and makes changing it a chore -- a stepper walks one at
 * a time and a slider lands anywhere.
 *
 * The ladder is not the whole story: a property's default is whatever C++
 * chose (3, 5, 6, 8, 10 and 16 all occur among the detail properties), and a
 * scene may already hold a value someone set by script. A list that could not
 * express either would show the row as something it is not, so both are merged
 * into the choices.
 */

import React from 'react'
import { PropertyField, SelectField } from '@renderer/h3-kit/form'
import { resetProps, type ResetFn, type SetFn } from './rowProps'
import { writeMany } from './multiWrite'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import type { RendererPropSectionProps } from '@renderer/features/inspector/rendererPropSections'

export interface NumEnumRowProps {
  label: string
  /** The properties this control stands for; the first one drives the display. */
  targets: GenericPropEntry[]
  /** Candidate levels; the property's default and current value are added. */
  ladder: number[]
  onSet: SetFn
  onSetMany: RendererPropSectionProps['onSetMany']
  onReset: ResetFn
  disabled?: boolean
}

/** The ladder plus the values the property actually holds, in order. */
function choices(ladder: number[], entry: GenericPropEntry): number[] {
  const all = [...ladder, Number(entry.value)]
  if (typeof entry.defaultValue === 'number') all.push(entry.defaultValue)
  return [...new Set(all.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b)
}

export const NumEnumRow: React.FC<NumEnumRowProps> = ({
  label,
  targets,
  ladder,
  onSet,
  onSetMany,
  onReset,
  disabled,
}) => {
  const primary = targets[0]
  return (
    <PropertyField label={label} inline {...resetProps(primary, onReset)}>
      <SelectField
        value={String(primary.value)}
        disabled={disabled || primary.readonly}
        onChange={(v) => writeMany(targets, Number(v), onSet, onSetMany)}
      >
        {choices(ladder, primary).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  )
}
