/**
 * @file components/inspector/CartoonRendererSection.tsx
 * @description Type-specific property sections for the cartoon renderer
 * (C++ `Ribbon2Renderer`, `type_name === "cartoon"`). It draws ribbon / tube
 * secondary-structure cartoons (helix / sheet / coil) along the main chain.
 *
 * Migrated from the UXP `cartoon-propdlg` tabs. The editable top-level
 * properties map to four accordion sections registered in
 * `rendererPropSections.tsx`:
 *   - "Cartoon" : axial detail / smooth color / end caps / segment-end fade /
 *                 anchor weight
 *   - "Helix"   : ribbon style / width mode + width params / spline smoothing /
 *                 extend
 *   - "Sheet"   : spline + width smoothing
 *   - "Coil"    : spline smoothing
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and its row renders nothing when the
 * property is absent (mirroring the UXP `findPropData` null checks).
 *
 * Scope / parity notes:
 *   - The per-section SHAPE controls in the UXP dialog (helix / sheet / coil
 *     `type` / `width` / `tuber` / `sharp` / `detail`, and the sheet / ribbon
 *     head junction `type` / `gamma` / ... ) live on read-only nested sub-objects
 *     (`TubeSection` / `JctTable`). The generic property bridge cannot write
 *     dot-path nested properties yet (`LScrObjBase::setProperty` is flat), so
 *     those stay in the Generic tab until nested writes are supported.
 *   - `axialdetail` ("Detail") uses a plain `NumericField` with the slider
 *     hidden (stepper input only), not the drag-numeric field, per request.
 *   - Drag-numeric rows commit on drag end / Enter (no realtime preview).
 *   - `helix_waver` (nopersist compatibility flag) and `dump_curvature` (debug)
 *     are intentionally not surfaced; `anchor_sel` (a selection) is left to the
 *     Generic tab.
 */

import React from "react";
import {
  NumRow,
  NumInputRow,
  BoolRow,
  resetProps,
} from "./RendererCommonSection";
import { PropertyField, SelectField } from "../../h3-kit/form";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

type SetFn = RendererPropSectionProps["onSet"];
type ResetFn = RendererPropSectionProps["onReset"];

// --- Local rows ---------------------------------------------------------------

interface MappedEnumRowProps {
  entry: GenericPropEntry;
  label: string;
  /** Display text per raw enum ID (value stays the raw C++ string ID). */
  labels: Record<string, string>;
  onSet: SetFn;
  onReset: ResetFn;
  disabled?: boolean;
}

/**
 * Enum dropdown that shows a friendly label per option while committing the raw
 * C++ enum string ID. Falls back to the raw ID for any option missing from
 * `labels`.
 */
const MappedEnumRow: React.FC<MappedEnumRowProps> = ({
  entry,
  label,
  labels,
  onSet,
  onReset,
  disabled,
}) => {
  const options = entry.enumdef ?? [String(entry.value)];
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={String(entry.value)}
        disabled={disabled || entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {labels[opt] ?? opt}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};

const CAP_LABELS: Record<string, string> = {
  sphere: "Round",
  flat: "Flat",
  none: "None",
};
const HELIX_WIDTH_MODE_LABELS: Record<string, string> = {
  const: "Constant",
  average: "Average",
  wavy: "Wavy",
};

// --- Sections -----------------------------------------------------------------

/**
 * "Cartoon" section: axial tessellation detail, color smoothing, the two
 * end-cap types, segment-end fade and the Calpha anchor weight.
 */
export const CartoonMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const axialdetail = get("axialdetail");
  const smoothcolor = get("smoothcolor");
  const startCap = get("start_captype");
  const endCap = get("end_captype");
  const segendFade = get("segend_fade");
  const anchorWeight = get("anchor_weight");

  return (
    <>
      {axialdetail && (
        <NumInputRow
          key={`axialdetail:${axialdetail.value}`}
          entry={axialdetail}
          label="Detail"
          onSet={onSet}
          onReset={onReset}
          min={2}
          max={20}
          step={1}
        />
      )}
      {smoothcolor && (
        <BoolRow entry={smoothcolor} label="Smooth color" onSet={onSet} onReset={onReset} />
      )}
      {startCap && (
        <MappedEnumRow
          entry={startCap}
          label="Start cap"
          labels={CAP_LABELS}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {endCap && (
        <MappedEnumRow
          entry={endCap}
          label="End cap"
          labels={CAP_LABELS}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {segendFade && (
        <BoolRow
          entry={segendFade}
          label="Segment-end fade"
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {anchorWeight && (
        <NumRow
          entry={anchorWeight}
          label="Anchor weight"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={20}
          step={0.5}
        />
      )}
    </>
  );
};

/**
 * "Helix" section: helix rendering style (cylinder vs ribbon), width mode and
 * its dependent width parameters, spline smoothing and axial extend. The width
 * params are gated by the width mode (constant width only for "const";
 * width-plus only for non-const; width smoothing only for "wavy"), matching the
 * UXP helix page enabled-state logic.
 */
export const CartoonHelixSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const ribbon = get("helix_ribbon");
  const widthMode = get("helix_width_mode");
  const width = get("helix_width");
  const wplus = get("helix_wplus");
  const wsmooth = get("helix_wsmooth");
  const smooth = get("helix_smooth");
  const extend = get("helix_extend");

  const mode = widthMode ? String(widthMode.value) : "average";
  const widthOff = mode !== "const";
  const wplusOff = mode === "const";
  const wsmoothOff = mode !== "wavy";

  return (
    <>
      {ribbon && (
        <BoolRow entry={ribbon} label="Ribbon style" onSet={onSet} onReset={onReset} />
      )}
      {widthMode && (
        <MappedEnumRow
          entry={widthMode}
          label="Width mode"
          labels={HELIX_WIDTH_MODE_LABELS}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {width && (
        <NumRow
          entry={width}
          label="Width (const)"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={5}
          step={0.1}
          unit="Å"
          disabled={widthOff}
        />
      )}
      {wplus && (
        <NumRow
          entry={wplus}
          label="Width plus"
          onSet={onSet}
          onReset={onReset}
          min={-2}
          max={3}
          step={0.1}
          unit="Å"
          disabled={wplusOff}
        />
      )}
      {wsmooth && (
        <NumRow
          entry={wsmooth}
          label="Width smoothing"
          onSet={onSet}
          onReset={onReset}
          min={-5}
          max={5}
          step={0.5}
          disabled={wsmoothOff}
        />
      )}
      {smooth && (
        <NumRow
          entry={smooth}
          label="Spline smoothing"
          onSet={onSet}
          onReset={onReset}
          min={-5}
          max={5}
          step={0.5}
        />
      )}
      {extend && (
        <NumRow
          entry={extend}
          label="Extend"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={3}
          step={0.1}
          unit="Å"
        />
      )}
    </>
  );
};

/** "Sheet" section: beta-strand spline and width smoothing. */
export const CartoonSheetSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const smooth = get("sheet_smooth");
  const wsmooth = get("sheet_wsmooth");

  return (
    <>
      {smooth && (
        <NumRow
          entry={smooth}
          label="Spline smoothing"
          onSet={onSet}
          onReset={onReset}
          min={-5}
          max={5}
          step={0.5}
        />
      )}
      {wsmooth && (
        <NumRow
          entry={wsmooth}
          label="Width smoothing"
          onSet={onSet}
          onReset={onReset}
          min={-5}
          max={5}
          step={0.5}
        />
      )}
    </>
  );
};

/** "Coil" section: coil spline smoothing. */
export const CartoonCoilSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const smooth = get("coil_smooth");

  return (
    <>
      {smooth && (
        <NumRow
          entry={smooth}
          label="Spline smoothing"
          onSet={onSet}
          onReset={onReset}
          min={-5}
          max={5}
          step={0.5}
        />
      )}
    </>
  );
};
