/**
 * @file components/inspector/SceneRenderingSection.tsx
 * @description Scene-target property sections for the inspector Properties tab
 * (C++ `qsys::Scene`, node `type === "scene"`).
 *
 * The Scene has no dedicated UXP property dialog -- its rendering/display
 * settings were only editable through the generic property tree. These curated
 * sections surface the meaningful subset (ambient occlusion / GTAO,
 * post-process anti-aliasing, background colour, CMYK colour proofing),
 * mirroring how the renderer-type sections (cpk / cartoon / ...) are built.
 * The AO/AA sections are deliberately preset-only (one dropdown each): the
 * individual tuning knobs stay in the generic property tree, and hand edits
 * there reflect back into the dropdowns as "Custom".
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as every other
 * Properties-tab section: each property is looked up by key in the live entry
 * list and its row renders nothing when absent. Every C++ setter calls
 * `setUpdateFlag()`, so edits preview live in the 3D view.
 *
 * Registered under the `scene` key in `RENDERER_SECTION_REGISTRY`; the section
 * titles come from that registry entry (these components render only the rows).
 */

import React from "react";
import {
  BoolRow,
  MappedEnumRow,
  ColorRow,
  TextRow,
} from "./rows";
import { PropertyField, SelectField } from "../../h3-kit/form";
import { RENDER_QUALITY_CUSTOM, stepPatch } from "../../data/renderSettings";
import type { RenderQualityAxis } from "../../data/renderSettings";
import {
  SCENE_AO_PRESET_AXIS,
  SCENE_AA_QUALITY_AXIS,
  sceneStepOf,
} from "../../data/sceneQualityPresets";
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';
import type { PropMultiWrite, RendererPropSectionProps } from "./rendererPropSections";

/** Find a live property entry by key. */
function finder(entries: GenericPropEntry[]) {
  return (key: string): GenericPropEntry | undefined =>
    entries.find((e) => e.key === key);
}

/**
 * Composite preset dropdown (umbreon quality-axis pattern): its step is
 * DERIVED from the live property values (`sceneStepOf`; reads "Custom" when
 * they match no step -- the Custom option is only offered while that is the
 * truth), and selecting a step applies its patch as ONE undo step via
 * `onSetMany`. Editing an individual row needs no bookkeeping: the dropdown
 * reads back from the values, so it drops to Custom -- or lands on another
 * step -- by itself. Carries no modified/reset decorations: no single
 * property backs it (same rationale as the atomintr Dashed toggle).
 */
const QualityRow: React.FC<{
  axis: RenderQualityAxis;
  entries: GenericPropEntry[];
  onSetMany?: RendererPropSectionProps["onSetMany"];
  disabled?: boolean;
}> = ({ axis, entries, onSetMany, disabled }) => {
  const get = finder(entries);
  // Render only when every property the axis writes is present.
  if (Object.keys(axis.steps[0].patch).some((k) => !get(k))) return null;

  const step = sceneStepOf(axis, (k) => get(k)?.value);
  const apply = (stepId: string) => {
    // "Custom" is a read-back state, not an applicable choice.
    if (stepId === RENDER_QUALITY_CUSTOM || !onSetMany) return;
    const writes: PropMultiWrite[] = Object.entries(stepPatch(axis, stepId)).map(
      ([key, value]) => ({ key, valueType: get(key)!.type, value }),
    );
    onSetMany(writes);
  };
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
  );
};

/**
 * Ambient occlusion (GTAO): enable toggle, a look-preset dropdown (radius /
 * steps / intensity / half-res as one tuned set, see `SCENE_AO_PRESET_AXIS`).
 * The individual tuning knobs (aoRadius / aoIntensity / aoSlices / aoSteps /
 * aoHalfRes) are deliberately NOT surfaced as their own rows here -- they
 * remain editable in the generic property tree, where edits reflect back into
 * this dropdown as "Custom". The preset is disabled while AO is off.
 */
export const SceneAmbientOcclusionSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
}) => {
  const get = finder(entries);
  const aoEnabled = get("aoEnabled");
  const off = aoEnabled ? !aoEnabled.value : true;
  return (
    <>
      {aoEnabled && (
        <BoolRow entry={aoEnabled} label="Enabled" onSet={onSet} onReset={onReset} />
      )}
      <QualityRow
        axis={SCENE_AO_PRESET_AXIS}
        entries={entries}
        onSetMany={onSetMany}
        disabled={off}
      />
    </>
  );
};

/**
 * Post-process anti-aliasing: one quality-preset dropdown (method + jitter as
 * one ladder, see `SCENE_AA_QUALITY_AXIS`). AA is independent of AO, so the
 * control is not gated on the AO flag. The individual knobs (aa_method /
 * aaJitterLevel / aaSmaaThreshold) are deliberately NOT surfaced here -- they
 * remain editable in the generic property tree, where edits (e.g. picking
 * SMAA) reflect back into this dropdown as "Custom".
 */
export const SceneAntialiasingSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSetMany,
}) => {
  return (
    <QualityRow
      axis={SCENE_AA_QUALITY_AXIS}
      entries={entries}
      onSetMany={onSetMany}
    />
  );
};

/** Scene background colour. */
export const SceneBackgroundSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const bgcolor = entries.find((e) => e.key === "bgcolor");
  if (!bgcolor) return null;
  return <ColorRow entry={bgcolor} label="Color" onSet={onSet} onReset={onReset} />;
};

const ICC_INTENT_LABELS: Record<string, string> = {
  perceptual: "Perceptual",
  relative_colorimetric: "Relative colorimetric",
  saturation: "Saturation",
  absolute_colorimetric: "Absolute colorimetric",
};

/** Default CMYK profile seeded when proofing is enabled with none set (UXP parity). */
const DEFAULT_ICC_PROFILE = "GenericCMYK.icm";

/**
 * CMYK colour proofing: enable toggle, ICC profile path, rendering intent.
 * Enabling with no profile set seeds a default CMYK profile in one undo step so
 * proofing actually takes effect (mirrors UXP `toggleSceneColorProofing`).
 */
export const SceneColorProofingSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
}) => {
  const get = finder(entries);
  const useColProof = get("use_colproof");
  const iccFilename = get("icc_filename");
  const iccIntent = get("icc_intent");

  const handleToggle: RendererPropSectionProps["onSet"] = (key, valueType, value) => {
    if (value === true && onSetMany && iccFilename && !String(iccFilename.value)) {
      onSetMany([
        { key, valueType, value: true },
        { key: "icc_filename", valueType: iccFilename.type, value: DEFAULT_ICC_PROFILE },
      ]);
    } else {
      onSet(key, valueType, value);
    }
  };

  return (
    <>
      {useColProof && (
        <BoolRow entry={useColProof} label="Enabled" onSet={handleToggle} onReset={onReset} />
      )}
      {iccFilename && (
        <TextRow
          key={`icc:${iccFilename.value}`}
          entry={iccFilename}
          label="Profile"
          placeholder="ICC profile"
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {iccIntent && (
        <MappedEnumRow
          entry={iccIntent}
          label="Intent"
          labels={ICC_INTENT_LABELS}
          onSet={onSet}
          onReset={onReset}
        />
      )}
    </>
  );
};
