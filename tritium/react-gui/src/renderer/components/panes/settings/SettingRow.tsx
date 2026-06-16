/**
 * @file components/panes/settings/SettingRow.tsx
 * @description Renders one setting row, picking the control widget
 * (select / number / toggle / color) from the SettingDef's `control`
 * discriminant. Toggle rows put the switch inline with the label;
 * the other kinds stack the control below the description.
 */

import React from 'react'
import { Button, HTMLSelect, NumericInput, Switch } from '@blueprintjs/core'
import { IPC } from '../../../../shared/ipcChannels'
import type { SettingDef } from './settingsConfig'
import { CueColorField } from '../../../h3-kit/colorpicker/CueColorField'
import type { Mode } from '../../../h3-kit/colorpicker/ColorPicker'

/**
 * App settings colours are scene-independent plain colours, so the picker
 * exposes only the editable colour spaces -- "Named" / "Mol" (which resolve
 * against a scene's StyleManager) make no sense here.
 */
const SETTING_COLOR_MODES: Mode[] = ['rgb', 'hsb', 'palette']

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
            className="config-setting-select h3-form-select"
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
          <CueColorField
            value={value as string}
            onCommit={(v) => onChange(key, v)}
            modes={SETTING_COLOR_MODES}
            className="config-setting-color-field"
          />
        )
      case 'path': {
        const directory = control.directory === true
        const handleBrowse = async (): Promise<void> => {
          try {
            const res = await window.electronAPI?.invoke(IPC.DIALOG_PICK_PATH, {
              title: `Select ${label}`,
              directory,
            })
            if (res && !res.canceled && res.filePath) onChange(key, res.filePath)
          } catch {
            /* dialog unavailable (e.g. Vite dev server) -- ignore */
          }
        }
        return (
          <div className="config-setting-path-row">
            <input
              type="text"
              className="config-setting-path-input"
              value={value as string}
              spellCheck={false}
              onChange={(e) => onChange(key, e.target.value)}
            />
            <Button small text="Browse…" onClick={handleBrowse} />
          </div>
        )
      }
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
