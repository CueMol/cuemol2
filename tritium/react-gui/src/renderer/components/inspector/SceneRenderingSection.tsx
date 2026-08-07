/**
 * @file components/inspector/SceneRenderingSection.tsx
 * @description Scene-target property sections for the inspector Properties tab
 * (C++ `qsys::Scene`, node `type === "scene"`).
 *
 * The Scene has no dedicated UXP property dialog -- its rendering/display
 * settings were only editable through the generic property tree. These curated
 * sections surface the meaningful subset (ambient occlusion / GTAO,
 * post-process anti-aliasing, background colour, CMYK colour proofing) with
 * purpose-built rows, mirroring how the renderer-type sections (cpk / cartoon /
 * ...) are built.
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as every other
 * Properties-tab section: each property is looked up by key in the live entry
 * list and its row renders nothing when absent. The numeric AO controls use the
 * shared `NumRow` (realtime drag preview + single undo). Every C++ setter calls
 * `setUpdateFlag()`, so edits preview live in the 3D view.
 *
 * Registered under the `scene` key in `RENDERER_SECTION_REGISTRY`; the section
 * titles come from that registry entry (these components render only the rows).
 */

import React from "react";
import {
  BoolRow,
  NumRow,
  NumEnumRow,
  MappedEnumRow,
  ColorRow,
  TextRow,
} from "./RendererCommonSection";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

/** Find a live property entry by key. */
function finder(entries: GenericPropEntry[]) {
  return (key: string): GenericPropEntry | undefined =>
    entries.find((e) => e.key === key);
}

/**
 * Ambient occlusion (GTAO): enable toggle plus radius / intensity / slices /
 * steps and adaptive half-resolution. The numeric and half-res rows are
 * disabled while AO is off (they have no effect without the AO path).
 */
export const SceneAmbientOcclusionSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = finder(entries);
  const aoEnabled = get("aoEnabled");
  const aoRadius = get("aoRadius");
  const aoIntensity = get("aoIntensity");
  const aoSlices = get("aoSlices");
  const aoSteps = get("aoSteps");
  const aoHalfRes = get("aoHalfRes");
  const off = aoEnabled ? !Boolean(aoEnabled.value) : true;
  return (
    <>
      {aoEnabled && (
        <BoolRow entry={aoEnabled} label="Enabled" onSet={onSet} onReset={onReset} />
      )}
      {aoRadius && (
        <NumRow
          entry={aoRadius}
          label="Radius"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={50}
          step={0.1}
          decimals={1}
          unit="Å"
          realtime
          disabled={off}
        />
      )}
      {aoIntensity && (
        <NumRow
          entry={aoIntensity}
          label="Intensity"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={10}
          step={0.1}
          decimals={1}
          realtime
          disabled={off}
        />
      )}
      {aoSlices && (
        <NumRow
          entry={aoSlices}
          label="Slices"
          onSet={onSet}
          onReset={onReset}
          min={1}
          max={32}
          step={1}
          decimals={0}
          realtime
          disabled={off}
        />
      )}
      {aoSteps && (
        <NumRow
          entry={aoSteps}
          label="Steps"
          onSet={onSet}
          onReset={onReset}
          min={1}
          max={16}
          step={1}
          decimals={0}
          realtime
          disabled={off}
        />
      )}
      {aoHalfRes && (
        <BoolRow
          entry={aoHalfRes}
          label="Half resolution"
          onSet={onSet}
          onReset={onReset}
          disabled={off}
        />
      )}
    </>
  );
};

const AA_METHOD_LABELS: Record<string, string> = {
  none: "None",
  fxaa: "FXAA",
  smaa: "SMAA",
};

// aaJitterLevel only takes 0-5 (GUIView.cpp clamps to this range: levels
// above 5 have no jitter table). 0 disables temporal jitter while AO stays
// on; 1-5 select the jitter sample-count table (1<<level samples).
const JITTER_LEVELS = [0, 1, 2, 3, 4, 5];
const JITTER_LEVEL_LABELS: Record<number, string> = { 0: "Off" };

/**
 * Post-process anti-aliasing: method (none / FXAA / SMAA) and temporal jitter
 * supersampling level. Jitter only accumulates on the AO path, so it is
 * disabled while AO is off. The level is a dropdown (`NumEnumRow`), not a
 * numeric stepper: it only takes the six values in `JITTER_LEVELS`.
 */
export const SceneAntialiasingSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = finder(entries);
  const aaMethod = get("aa_method");
  const aaJitter = get("aaJitterLevel");
  const aoEnabled = get("aoEnabled");
  const jitterOff = aoEnabled ? !Boolean(aoEnabled.value) : true;
  return (
    <>
      {aaMethod && (
        <MappedEnumRow
          entry={aaMethod}
          label="Method"
          labels={AA_METHOD_LABELS}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {aaJitter && (
        <NumEnumRow
          entry={aaJitter}
          label="Jitter SS"
          options={JITTER_LEVELS}
          labels={JITTER_LEVEL_LABELS}
          onSet={onSet}
          onReset={onReset}
          disabled={jitterOff}
        />
      )}
    </>
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
