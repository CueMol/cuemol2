/**
 * @file components/panes/settings/SettingRow.tsx
 * @description Renders one setting row, picking the control widget from the
 * SettingDef's `control` discriminant. All controls are h3-kit form widgets
 * (`SelectField` / `NumericField` / `SwitchField` / `ColorField` / `TextField`
 * + `FormButton`). Toggle rows put the switch inline with the label; the other
 * kinds stack the control below the description.
 */

import React from 'react'
import {
  SelectField,
  NumericField,
  SwitchField,
  ColorField,
  TextField,
  FormButton,
} from '@renderer/h3-kit/form'
import { IPC } from '@shared/ipcChannels'
import type { SettingDef } from './settingsConfig'
import type { Mode } from '@renderer/h3-kit/colorpicker/ColorPicker'

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
        // `renderInOwnFont` (font picker) draws each option in its own
        // typeface -- Chromium renders per-option `font-family` in the native
        // dropdown, so the user previews each face inline.
        return (
          <SelectField value={value as string} onChange={(v) => onChange(key, v)}>
            {control.options.map((o) => (
              <option
                key={o}
                value={o}
                style={control.renderInOwnFont ? { fontFamily: o } : undefined}
              >
                {o}
              </option>
            ))}
          </SelectField>
        )
      case 'number':
        return (
          <NumericField
            value={value as number}
            onChange={(val) => onChange(key, val)}
            min={control.min}
            max={control.max}
            step={control.step}
            unit={control.unit}
          />
        )
      case 'toggle':
        return (
          <SwitchField
            checked={value as boolean}
            onChange={(checked) => onChange(key, checked)}
          />
        )
      case 'color':
        return (
          <ColorField
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
            <TextField value={value as string} onChange={(v) => onChange(key, v)} />
            <FormButton text="Browse…" onClick={handleBrowse} />
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
