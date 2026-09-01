/**
 * @file dialogs/NewSceneSettingsFields.tsx
 * @description The New Tab dialog's "Scene settings" rows: what a new scene
 * starts out looking like.
 *
 * The two quality rows offer the same preset ladders as the Scene inspector
 * (`data/sceneQualityPresets`), so a setting chosen here and the one read back
 * in the inspector afterwards are the same choice rather than two spellings of
 * it. The dialog itself owns no C++ scene, so the colour picker is mounted
 * scene-free and its scene-scoped modes (Named / Mol) are left out.
 */

import React from 'react'
import { ColorPickerProvider } from '@renderer/h3-kit/colorpicker'
import {
  ColorField,
  Field,
  FieldSection,
  SelectField,
  SwitchField,
} from '@renderer/h3-kit/form'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import type { NewSceneDefaults } from '@renderer/data/newSceneDefaults'
import {
  SCENE_AA_QUALITY_AXIS,
  SCENE_AO_PRESET_AXIS,
} from '@renderer/data/sceneQualityPresets'

/** Modes that need a scene to resolve against, and so cannot be offered here. */
const SCENE_FREE_COLOR_MODES = ['rgb', 'hsb', 'palette'] as const

/**
 * Ambient occlusion reads as one four-way choice -- off, then the three
 * presets -- rather than a switch plus a preset the switch greys out. The
 * scene keeps the two properties (`aoEnabled` and the preset patch) apart, so
 * turning it off here leaves the chosen preset remembered for turning it back
 * on.
 */
const AO_OFF = 'off'

export interface NewSceneSettingsFieldsProps {
  value: NewSceneDefaults
  onChange: (next: NewSceneDefaults) => void
  disabled?: boolean
}

export const NewSceneSettingsFields: React.FC<NewSceneSettingsFieldsProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const { cm } = useCueMol()
  const patch = (part: Partial<NewSceneDefaults>): void => onChange({ ...value, ...part })

  return (
    <FieldSection title="Scene settings">
      <Field label="Anti-aliasing">
        <SelectField
          value={value.aaPreset}
          disabled={disabled}
          onChange={(v) => patch({ aaPreset: v })}
        >
          {SCENE_AA_QUALITY_AXIS.steps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
      </Field>

      <Field label="Ambient occlusion">
        <SelectField
          value={value.aoEnabled ? value.aoPreset : AO_OFF}
          disabled={disabled}
          onChange={(v) =>
            patch(v === AO_OFF ? { aoEnabled: false } : { aoEnabled: true, aoPreset: v })
          }
        >
          <option value={AO_OFF}>Off</option>
          {SCENE_AO_PRESET_AXIS.steps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
      </Field>

      <Field label="Background">
        <ColorPickerProvider cm={cm} sceneId={undefined}>
          <ColorField
            value={value.bgcolor}
            disabled={disabled}
            modes={[...SCENE_FREE_COLOR_MODES]}
            onCommit={(v) => patch({ bgcolor: v })}
          />
        </ColorPickerProvider>
      </Field>

      <Field label="CMYK color proofing" inline>
        <SwitchField
          checked={value.useColproof}
          disabled={disabled}
          onChange={(checked) => patch({ useColproof: checked })}
        />
      </Field>
    </FieldSection>
  )
}
