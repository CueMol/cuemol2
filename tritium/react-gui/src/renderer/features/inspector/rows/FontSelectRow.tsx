/**
 * @file features/inspector/rows/FontSelectRow.tsx
 * @description A font-family picker for a STRING property.
 *
 * The installed families come from `useSystemFonts`, the same source the
 * Settings pane's label font uses, and each option is drawn in the face it
 * names so the list can be read rather than recalled. A value the system does
 * not report -- a font from a scene authored elsewhere -- stays selectable at
 * the top of the list so it round-trips instead of being silently rewritten.
 */

import React from 'react'
import { PropertyField, SelectField } from '@renderer/h3-kit/form'
import { useSystemFonts } from '@renderer/features/settings/useSystemFonts'
import { resetProps, type RowProps } from './rowProps'

export interface FontSelectRowProps extends RowProps {
  disabled?: boolean
}

export const FontSelectRow: React.FC<FontSelectRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  disabled,
}) => {
  const fonts = useSystemFonts()
  const current = String(entry.value)
  const options = fonts.includes(current) ? fonts : [current, ...fonts]
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={current}
        disabled={disabled || entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        {options.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  )
}
