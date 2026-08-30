/**
 * @file components/inspector/rows/QualityPresetRow.tsx
 * @description A preset dropdown over a whole set of tuning properties.
 *
 * A block rather than a row because no single property backs it. The scene's
 * ambient-occlusion look and its anti-aliasing quality are each a ladder of
 * tuned combinations (radius / steps / intensity / half-res; method / jitter),
 * and picking a step applies the whole patch as one undo step. The knobs stay
 * editable in the generic property tree, so the dropdown READS BACK from the
 * live values: hand-edit one and it drops to "Custom" by itself, edit it into
 * another step and it lands there. "Custom" is therefore offered only while it
 * is the truth, never as something to pick.
 *
 * It carries no modified bar or reset for the same reason it is not a row:
 * there is nothing single to reset.
 */

import React from 'react'
import { PropertyField, SelectField } from '@renderer/h3-kit/form'
import { RENDER_QUALITY_CUSTOM, stepPatch } from '@renderer/data/renderSettings'
import { sceneStepOf } from '@renderer/data/sceneQualityPresets'
import type { RenderQualityAxis } from '@renderer/data/renderSettings'
import type { PropMultiWrite } from '@renderer/features/inspector/rendererPropSections'
import type { CustomRowProps } from '@renderer/features/inspector/schema/types'

/**
 * A preset dropdown for one quality axis. Called at module scope by the page
 * that wants it, so the component identity is stable across renders.
 */
export function qualityPresetRow(axis: RenderQualityAxis): React.FC<CustomRowProps> {
  const QualityPresetRow: React.FC<CustomRowProps> = ({ ctx, onSetMany, disabled }) => {
    // Show it only when every property the axis writes is present.
    if (Object.keys(axis.steps[0].patch).some((k) => !ctx.get(k))) return null

    const step = sceneStepOf(axis, (k) => ctx.get(k)?.value)
    const apply = (stepId: string): void => {
      // "Custom" is a read-back state, not an applicable choice.
      if (stepId === RENDER_QUALITY_CUSTOM || !onSetMany) return
      const writes: PropMultiWrite[] = Object.entries(stepPatch(axis, stepId)).map(
        ([key, value]) => ({ key, valueType: ctx.get(key)!.type, value }),
      )
      onSetMany(writes)
    }
    return (
      <PropertyField label={axis.label}>
        <SelectField value={step} disabled={disabled} onChange={apply}>
          {axis.steps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          {step === RENDER_QUALITY_CUSTOM && (
            <option value={RENDER_QUALITY_CUSTOM}>Custom</option>
          )}
        </SelectField>
      </PropertyField>
    )
  }
  QualityPresetRow.displayName = `QualityPresetRow(${axis.label})`
  return QualityPresetRow
}
