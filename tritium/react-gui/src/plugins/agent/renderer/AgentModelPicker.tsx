/**
 * @file plugins/agent/renderer/AgentModelPicker.tsx
 * @description The model dropdown at the top of the pane.
 *
 * Writes the same preference as the Model row in Settings, so the two never
 * disagree: the preference is the source of truth and this is one more view
 * of it.
 */

import React, { useMemo } from 'react'
import { usePluginPrefs } from '@renderer/plugin-host/api'
import { Field, SelectField } from '@renderer/h3-kit/form'
import { AGENT_PLUGIN_ID, AGENT_PREF_KEYS, DEFAULT_AGENT_MODEL } from '../shared/agentTypes'
import { PROVIDERS, PROVIDER_LABELS } from '../shared/modelSpec'
import { useAvailableModels } from './useAvailableModels'

void React

export const AgentModelPicker: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { prefs, setPref } = usePluginPrefs(AGENT_PLUGIN_ID)
  const { choices } = useAvailableModels()
  const current = String(prefs[AGENT_PREF_KEYS.model] ?? DEFAULT_AGENT_MODEL)

  const groups = useMemo(
    () =>
      PROVIDERS.map((provider) => ({
        provider,
        choices: choices.filter((c) => c.provider === provider),
      })).filter((g) => g.choices.length > 0),
    [choices],
  )

  // An id typed into Settings, or one whose key has since gone, is still what
  // the next turn runs on; leaving it out would show a model that is not.
  const currentListed = choices.some((c) => c.value === current)

  return (
    <div className="agent-model-bar">
      <Field label="Model" inline>
        <SelectField
          value={current}
          onChange={(value) => { setPref(AGENT_PREF_KEYS.model, value) }}
          disabled={disabled}
          aria-label="Model"
        >
          {!currentListed && <option value={current}>{current}</option>}
          {groups.map((g) => (
            <optgroup key={g.provider} label={PROVIDER_LABELS[g.provider]}>
              {g.choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.modelId}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
      </Field>
    </div>
  )
}
AgentModelPicker.displayName = 'AgentModelPicker'
