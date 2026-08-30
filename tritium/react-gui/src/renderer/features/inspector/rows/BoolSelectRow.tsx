/**
 * @file components/inspector/rows/BoolSelectRow.tsx
 * @description A boolean shown as a two-choice dropdown rather than a switch.
 *
 * For a flag that reads as a choice between two things rather than as
 * something being on: a cartoon helix is drawn as a Cylinder or as a Ribbon,
 * and "Ribbon [x]" would name neither. The stored value is still the boolean.
 */

import React from 'react'
import { PropertyField, SelectField } from '@renderer/h3-kit/form'
import { resetProps, type RowProps } from './rowProps'

export interface BoolSelectRowProps extends RowProps {
  /** How the two states read, and the option ids that carry them. */
  offOption: { value: string; label: string }
  onOption: { value: string; label: string }
  disabled?: boolean
}

export const BoolSelectRow: React.FC<BoolSelectRowProps> = ({
  entry,
  label,
  offOption,
  onOption,
  onSet,
  onReset,
  disabled,
}) => (
  <PropertyField label={label} {...resetProps(entry, onReset)}>
    <SelectField
      value={entry.value ? onOption.value : offOption.value}
      disabled={disabled || entry.readonly}
      onChange={(v) => onSet(entry.key, entry.type, v === onOption.value)}
    >
      <option value={offOption.value}>{offOption.label}</option>
      <option value={onOption.value}>{onOption.label}</option>
    </SelectField>
  </PropertyField>
)
