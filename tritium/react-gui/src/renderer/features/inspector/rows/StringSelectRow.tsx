/**
 * @file features/inspector/rows/StringSelectRow.tsx
 * @description A dropdown over a fixed option set for a STRING property.
 *
 * Not every property with a handful of sensible values is a C++ enum: a
 * label's font style and weight are CSS strings, so they carry no `enumdef`
 * for `EnumRow` to read. The options are named by the page instead, and a
 * value outside the set stays selectable so a hand-written one round-trips.
 */

import React from 'react'
import { PropertyField, SelectField } from '@renderer/h3-kit/form'
import { resetProps, type RowProps } from './rowProps'

export interface StringSelectOption {
  label: string
  value: string
}

export interface StringSelectRowProps extends RowProps {
  options: StringSelectOption[]
  disabled?: boolean
}

export const StringSelectRow: React.FC<StringSelectRowProps> = ({
  entry,
  label,
  options,
  onSet,
  onReset,
  disabled,
}) => {
  const current = String(entry.value)
  const known = options.some((o) => o.value === current)
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={current}
        disabled={disabled || entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        {!known && <option value={current}>{current}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  )
}
