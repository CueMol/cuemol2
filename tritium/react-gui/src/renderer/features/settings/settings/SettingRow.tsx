/**
 * @file features/settings/settings/SettingRow.tsx
 * @description Renders one setting row, picking the control widget from the
 * SettingDef's `control` discriminant. All controls are h3-kit form widgets
 * (`SelectField` / `NumericField` / `SwitchField` / `ColorField` / `TextField`
 * + `FormButton`). Toggle rows put the switch inline with the label; the other
 * kinds stack the control below the description.
 *
 * The `secret` kind is the one that owns state of its own: its value lives in
 * the OS keychain rather than in the pane, so it is delegated whole (see
 * `SecretSettingControl`).
 */

import React from 'react'
import {
  ComboBoxField,
  SelectField,
  NumericField,
  SwitchField,
  ColorField,
  TextField,
  FormButton,
} from '@renderer/h3-kit/form'
import { IPC } from '@shared/ipcChannels'
import type { SettingDef } from './settingsConfig'
import type { Mode } from '@renderer/h3-kit/colorpicker'
import { SecretSettingControl } from './SecretSettingControl'
import { pluginPrefFromSettingKey } from './pluginSettings'

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
      case 'text':
        return (
          <TextField
            value={value as string}
            onChange={(v) => onChange(key, v)}
            placeholder={control.placeholder}
            mono={control.mono}
          />
        )
      case 'combo':
        // The dropdown carries what each suggestion is for; the field still
        // takes anything, so a value the list has not heard of is not refused.
        return (
          <ComboBoxField
            value={String(value)}
            onChange={(v) => onChange(key, v)}
            options={control.options}
            placeholder={control.placeholder}
            triggerLabel={`Suggestions for ${label}`}
            emptyText="No suggestions"
          />
        )
      case 'secret':
        // The value never reaches this component: the control reads its own
        // status from main. The key it addresses is the plugin-facing half of
        // the row key, not the fully qualified one the pane routes on.
        return (
          <SecretSettingControl
            namespace={control.namespace}
            secretKey={pluginPrefFromSettingKey(key)?.prefKey ?? key}
            envVar={control.envVar}
            label={label}
          />
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
