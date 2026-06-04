/**
 * @file components/inspector/DSurfaceRendererSection.tsx
 * @description Type-specific property sections for the direct-surface renderer
 * (C++ `DirectSurfRenderer`, `type_name === "dsurface"`). It computes and draws
 * a molecular surface (van der Waals / solvent accessible / solvent excluded)
 * directly from a molecule's atoms.
 *
 * Migrated from the UXP `dsurf-propdlg` "MolSurf" and "Atom radii" tabs (the
 * "Common" tab is the shared `renderer-common-page`, already covered by
 * `RendererCommonSection`). Only the controls that the UXP dialog actually
 * exposes for dsurface are surfaced, mapped to two accordion sections:
 *   - "Surface"    : the MolSurf "Draw" groupbox -- drawing mode / line-point
 *                    size (disabled while filled) / surface type / detail
 *   - "Atom radii" : the seven per-element van der Waals radii
 *
 * The MolSurf "Show selected" group (target / showsel) and the coloring-mode
 * dropdown are coloring concerns owned by the (not-yet-migrated) Coloring panel,
 * so they are intentionally out of scope here.
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and its row renders nothing when the
 * property is absent (mirroring the UXP `findPropData` null checks).
 *
 * Per request: drag-numeric rows commit on drag end / Enter (no realtime
 * preview), and "Detail" uses the plain inline stepper, not a slider.
 */

import React from "react";
import {
  NumRow,
  NumInputRow,
  resetProps,
} from "./RendererCommonSection";
import { PropertyField, SelectField } from "../../h3-kit/form";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

type SetFn = RendererPropSectionProps["onSet"];
type ResetFn = RendererPropSectionProps["onReset"];

// --- Local rows ---

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
 * C++ enum string ID (e.g. surftype `ses` shown as "Solvent excluded"). Falls
 * back to the raw ID for any option missing from `labels`.
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

// --- Sections ---

const DRAWMODE_LABELS: Record<string, string> = {
  fill: "Fill",
  line: "Wireframe",
  point: "Dots",
};
const SURFTYPE_LABELS: Record<string, string> = {
  vdw: "van der Waals",
  sas: "Solvent accessible",
  ses: "Solvent excluded",
};

/**
 * "Surface" section: the UXP MolSurf "Draw" groupbox. Drawing mode, line / point
 * size, surface type and tessellation detail, in the UXP row order. The size row
 * is disabled while the draw mode is "fill" (a filled mesh has no line / point
 * width); "Detail" uses the plain inline stepper.
 */
export const DSurfaceMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const drawmode = get("drawmode");
  const width = get("width");
  const surftype = get("surftype");
  const detail = get("detail");

  const filled = drawmode ? String(drawmode.value) === "fill" : false;

  return (
    <>
      {drawmode && (
        <MappedEnumRow
          entry={drawmode}
          label="Drawing mode"
          labels={DRAWMODE_LABELS}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {width && (
        <NumRow
          entry={width}
          label="Line/Point size"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={10}
          step={0.1}
          decimals={1}
          unit="px"
          disabled={filled}
        />
      )}
      {surftype && (
        <MappedEnumRow
          entry={surftype}
          label="Surface type"
          labels={SURFTYPE_LABELS}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {detail && (
        <NumInputRow
          key={`detail:${detail.value}`}
          entry={detail}
          label="Detail"
          onSet={onSet}
          onReset={onReset}
          min={1}
          max={21}
          step={1}
        />
      )}
    </>
  );
};

/** Per-element van der Waals radius rows, in the UXP "Atom radii" tab order. */
const RADII_ROWS: { key: string; label: string }[] = [
  { key: "vdwr_C", label: "Carbon" },
  { key: "vdwr_N", label: "Nitrogen" },
  { key: "vdwr_O", label: "Oxygen" },
  { key: "vdwr_S", label: "Sulfur" },
  { key: "vdwr_P", label: "Phosphorus" },
  { key: "vdwr_H", label: "Hydrogen" },
  { key: "vdwr_X", label: "Others" },
];

/**
 * "Atom radii" section: the seven per-element van der Waals radii used for the
 * surface calculation (UXP `propeditor-radii-common` "Atom radii" groupbox).
 */
export const DSurfaceRadiiSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);
  return (
    <>
      {RADII_ROWS.map(({ key, label }) => {
        const e = get(key);
        return e ? (
          <NumRow
            key={key}
            entry={e}
            label={label}
            onSet={onSet}
            onReset={onReset}
            min={0}
            max={3}
            step={0.05}
            fineSnap={0.01}
            coarseSnap={0.5}
            decimals={2}
            unit="Å"
          />
        ) : null;
      })}
    </>
  );
};
