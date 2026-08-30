/**
 * @file components/inspector/RenderSettingsEditor.tsx
 * @description "Render" tab of the Rendering window's settings pane
 * (RenderSettingsPane).
 *
 * Shows one merged, ordered set of accordion groups. Backend-independent
 * (common) and backend-specific props share the same grouping so a group like
 * "Quality" or "Edges" that both contribute to renders as a single section
 * (never a common "Quality" next to an "Umbreon Quality"). Edits update the
 * window-local useRenderSettings state; the frozen snapshot is sent to the main
 * window when a render starts.
 *
 * The backend selector is not here: it sits in the run bar next to the render
 * target (RenderPanel), where it belongs with the run controls.
 */

import React from "react";

import { PropGroupedEditor } from "./PropGroupedEditor";
import { Field, FieldSection, SelectField } from "@renderer/h3-kit/form";
import type { PropDef } from "@renderer/data/rendererProperties";
import {
  RENDER_COMMON_GROUPS,
  RENDER_QUALITY_CUSTOM,
  axesFor,
  type RenderBackendId,
  type RenderGroupDef,
  type RenderLightingMode,
  type RenderQualitySteps,
} from "@renderer/data/renderSettings";
import { RENDER_BACKENDS } from "@renderer/data/renderBackends";

/**
 * Display order for every settings group (common + any backend's). The Image
 * group is intentionally absent: image settings live in the sibling "Image"
 * tab (RenderImageTab), not here. Groups with no visible props are dropped by
 * PropGroupedEditor, so this superset is safe for every backend. Backend
 * groups not listed here are appended in their declared order.
 */
const GROUP_ORDER = [
  "Camera",
  "Hatching",
  "Antialiasing",
  "Quality",
  "Edges",
  "Shadows",
  "Ambient Occlusion",
  "Global Illumination",
  "POV-Ray",
];

interface RenderSettingsEditorProps {
  /** Currently selected backend. */
  backend: RenderBackendId;
  /** Backend-independent property definitions. */
  commonProps: PropDef[];
  /** Active backend's property definitions. */
  backendProps: PropDef[];
  /** Called when any setting value changes. */
  onChange: (key: string, value: string | number | boolean) => void;
  /** Active lighting method (derived from the props by useRenderSettings). */
  lighting: RenderLightingMode;
  /** Selected step per quality axis ("custom" once a value was overridden). */
  qualitySteps: RenderQualitySteps;
  /** Switch the lighting method (AO / GI are mutually exclusive). */
  onLightingChange: (mode: RenderLightingMode) => void;
  /** Move one quality axis to a step. */
  onQualityStepChange: (axisKey: string, stepId: string) => void;
}

export const RenderSettingsEditor: React.FC<RenderSettingsEditorProps> = ({
  backend,
  commonProps,
  backendProps,
  onChange,
  lighting,
  qualitySteps,
  onLightingChange,
  onQualityStepChange,
}) => {
  const backendGroups = RENDER_BACKENDS[backend].groups;
  const quality = RENDER_BACKENDS[backend].quality;

  // Hide common settings the active backend does not honor (e.g. Umbreon has no
  // stereo / post-blend), and the Image group, which lives in the Image tab.
  // PropGroupedEditor drops any group left with no props, so a fully-hidden
  // common group simply disappears (no empty accordion).
  const hiddenCommon = new Set(RENDER_BACKENDS[backend].unsupportedCommonKeys ?? []);
  const visibleCommonProps = commonProps.filter(
    (p) => p.group !== "Image" && !hiddenCommon.has(p.key),
  );

  // With a quality table the top section owns the lighting switches and the
  // lead props (supersampling), so the accordions below must not repeat them;
  // the groups belonging to the *other* depth-cue method drop out entirely,
  // since that method is off and its settings would not be read.
  const inactiveLightingGroups = new Set(
    (quality?.lightings ?? [])
      .filter((l) => l.id !== lighting && l.group)
      .map((l) => l.group!),
  );
  const hiddenBackendKeys = new Set(quality?.lightingKeys ?? []);
  const visibleBackendProps = backendProps.filter(
    (p) => !hiddenBackendKeys.has(p.key) && !inactiveLightingGroups.has(p.group),
  );
  // Axes that apply to the active method, each one dropdown.
  const visibleAxes = quality ? axesFor(quality, lighting) : [];

  // Merge common + backend props and their groups so shared group keys (e.g.
  // "Quality", "Edges") render as a single accordion. The backend's group def
  // wins on a key clash (its defaultExpanded), then GROUP_ORDER fixes display
  // order (any unlisted backend group is appended in declared order).
  const allProps: PropDef[] = [...visibleCommonProps, ...visibleBackendProps];
  const groupDefs = new Map<string, RenderGroupDef>();
  for (const g of RENDER_COMMON_GROUPS) groupDefs.set(g.key, g);
  for (const g of backendGroups) groupDefs.set(g.key, g);
  const orderedGroups: RenderGroupDef[] = [
    ...GROUP_ORDER.filter((k) => groupDefs.has(k)).map((k) => groupDefs.get(k)!),
    ...[...groupDefs.values()].filter((g) => !GROUP_ORDER.includes(g.key)),
  ].filter((g) => !inactiveLightingGroups.has(g.key));

  return (
    <div className="insp-properties-tab">
      {/* -- Quality: the depth-cue method plus one dropdown per quality axis.
             The axes are independent (image quality and shadows have nothing
             to do with which depth cue is active), so they are set separately
             rather than folded into a single overall level. -- */}
      {quality && (
        <div className="insp-render-quality">
          <FieldSection title="Quality">
            <Field label="Lighting">
              <SelectField
                value={lighting}
                onChange={(v) => onLightingChange(v as RenderLightingMode)}
              >
                {quality.lightings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </SelectField>
            </Field>

            {visibleAxes.map((axis) => {
              const step = qualitySteps[axis.key] ?? axis.defaultStep;
              return (
                <Field key={axis.key} label={axis.label}>
                  <SelectField
                    value={step}
                    onChange={(v) => onQualityStepChange(axis.key, v)}
                  >
                    {axis.steps.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                    {/* Only offered while it is the truth: the axis reads back
                        from its props, so Custom means they match no step. */}
                    {step === RENDER_QUALITY_CUSTOM && (
                      <option value={RENDER_QUALITY_CUSTOM}>Custom</option>
                    )}
                  </SelectField>
                </Field>
              );
            })}
          </FieldSection>
        </div>
      )}

      {/* -- One merged set of ordered groups (common + backend). Image
             settings are not here; they live in the Image tab. -- */}
      <PropGroupedEditor
        properties={allProps}
        groups={orderedGroups}
        onChange={onChange}
      />
    </div>
  );
};
