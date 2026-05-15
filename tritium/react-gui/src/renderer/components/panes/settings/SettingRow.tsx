/**
 * @file components/panes/settings/SettingRow.tsx
 * @description Renders one setting row, picking the control widget
 * (select / number / toggle / color) from the SettingDef's `control`
 * discriminant. Toggle rows put the switch inline with the label;
 * the other kinds stack the control below the description.
 */

import React from 'react'
import { HTMLSelect, NumericInput, Switch } from '@blueprintjs/core'
import type { SettingDef } from './settingsConfig'

export interface SettingRowProps {
  def: SettingDef
  value: string | number | boolean
  onChange: (key: string, value: string | number | boolean) => void
}

export const SettingRow: React.FC<SettingRowProps> = ({ def, value, onChange }) => {
  const { key, label, description, control } = def

  const renderControl = () => {
    switch (control.kind) {
      case 'select':
        return (
          <HTMLSelect
            className="config-setting-select"
            value={value as string}
            onChange={(e) => onChange(key, e.target.value)}
            options={control.options}
          />
        )
      case 'number':
        return (
          <NumericInput
            className="config-setting-numeric"
            value={value as number}
            onValueChange={(val) => onChange(key, val)}
            min={control.min}
            max={control.max}
            stepSize={control.step}
            minorStepSize={control.minorStep}
          />
        )
      case 'toggle':
        return (
          <Switch
            className="config-setting-switch"
            checked={value as boolean}
            onChange={(e) =>
              onChange(key, (e.target as HTMLInputElement).checked)
            }
            alignIndicator="right"
          />
        )
      case 'color':
        return (
          <div className="config-setting-color-row">
            <input
              type="color"
              className="config-setting-color-swatch"
              value={value as string}
              onChange={(e) => onChange(key, e.target.value)}
            />
            <span className="config-setting-color-hex">{value as string}</span>
          </div>
        )
      default:
        return null
    }
  }

  if (control.kind === 'toggle') {
    return (
      <div className="config-setting config-setting-toggle">
        <div className="config-setting-text">
          <div className="config-setting-label">{label}</div>
          <div className="config-setting-desc">{description}</div>
        </div>
        {renderControl()}
      </div>
    )
  }

  return (
    <div className="config-setting">
      <div className="config-setting-label">{label}</div>
      <div className="config-setting-desc">{description}</div>
      <div className="config-setting-control">{renderControl()}</div>
    </div>
  )
}
