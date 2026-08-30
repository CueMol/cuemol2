/**
 * @file components/inspector/rows/CenterUpdateRow.tsx
 * @description The map renderers' tri-state "Center update" selector.
 *
 * A block rather than a row because the three choices the UXP menulist offered
 * are two stored booleans: None is (autoupdate off, dragupdate off), Automatic
 * is (on, off) and Automatic (drag) is (on, on). Both are written together, or
 * the map would follow the camera in a state nobody picked, and reset restores
 * both since the shown value is the pair.
 */

import React from 'react'
import { PropertyField, SelectField } from '@renderer/h3-kit/form'
import { resetProps } from './rowProps'
import type { CustomRowProps } from '@renderer/features/inspector/schema/types'

/** Center-update menulist labels (UXP `map-update`). */
const LABELS: Record<string, string> = {
  none: 'None',
  auto: 'Automatic',
  drag: 'Automatic (drag)',
}
const OPTIONS = ['none', 'auto', 'drag']

export const CenterUpdateRow: React.FC<CustomRowProps> = ({
  ctx,
  onSet,
  onSetMany,
  onReset,
  disabled,
}) => {
  const autoEntry = ctx.get('autoupdate')
  const dragEntry = ctx.get('dragupdate')
  if (!autoEntry || !dragEntry) return null

  const auto = Boolean(autoEntry.value)
  const drag = Boolean(dragEntry.value)
  const current = !auto ? 'none' : drag ? 'drag' : 'auto'

  const commit = (v: string): void => {
    const nextAuto = v !== 'none'
    const nextDrag = v === 'drag'
    if (nextAuto === auto && nextDrag === drag) return
    if (onSetMany) {
      onSetMany([
        { key: autoEntry.key, valueType: autoEntry.type, value: nextAuto },
        { key: dragEntry.key, valueType: dragEntry.type, value: nextDrag },
      ])
    } else {
      onSet(autoEntry.key, autoEntry.type, nextAuto)
      onSet(dragEntry.key, dragEntry.type, nextDrag)
    }
  }

  // Reset both booleans (the displayed state derives from the pair).
  const resetBoth = (): void => {
    onReset(autoEntry.key)
    onReset(dragEntry.key)
  }

  return (
    <PropertyField label="Center update" {...resetProps(autoEntry, resetBoth)}>
      <SelectField
        value={current}
        disabled={disabled || autoEntry.readonly}
        onChange={commit}
      >
        {OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {LABELS[opt]}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  )
}
