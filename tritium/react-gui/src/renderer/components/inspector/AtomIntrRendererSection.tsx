/**
 * @file components/inspector/AtomIntrRendererSection.tsx
 * @description Type-specific property sections for the atom-interaction renderer
 * (C++ `AtomIntrRenderer`, `type_name === "atomintr"`). It draws the
 * distance / angle / torsion measurement lines (and optional value labels)
 * between atoms.
 *
 * Migrated from the UXP `atomintr-propdlg.xul` "Interaction" tab. Its groupboxes
 * map to four accordion sections registered in `rendererPropSections.tsx`:
 *   - "Interaction"  : mode / width / color / showlabel
 *   - "Dashed line"  : a synthetic "Dashed" toggle plus the six stipple pattern
 *                      lengths (stipple0..5) shown as one row of compact dash /
 *                      gap numeric cells
 *   - "3D tube"      : detail / start + end cap type / arrow head size
 *                      (disabled while mode is "simple")
 *   - "Value label"  : label font size / name / style / weight
 *                      (disabled while showlabel is off)
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and its row renders nothing when the
 * property is absent (mirroring the UXP `findPropData` null checks).
 *
 * UXP parity notes:
 *   - width unit follows mode: "A" while fancy (tube), "px" while simple (line).
 *   - mode-gated controls (detail / caps) are disabled, not hidden, when simple.
 *   - the "Dashed" checkbox is synthetic: there is no single dashed property.
 *     A line is dashed when any stipple >= 0; turning it off sets all six to -1,
 *     turning it on restores a single dash/gap pair (stipple0 = stipple1 = 1,
 *     stipple2..5 = -1). The whole rewrite is one undo step via `onSetMany`.
 *   - arrow height / width only matter when a cap is "arrow", so they are
 *     disabled otherwise.
 */

import React from "react";
import {
  NumRow,
  BoolRow,
  ColorRow,
  TextRow,
  MappedEnumRow,
  resetProps,
} from "./RendererCommonSection";
import {
  PropertyField,
  Field,
  SelectField,
  SwitchField,
  NumberCell,
} from "../../h3-kit/form";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type {
  RendererPropSectionProps,
  PropMultiWrite,
} from "./rendererPropSections";

type SetFn = RendererPropSectionProps["onSet"];
type ResetFn = RendererPropSectionProps["onReset"];

// ────────────────────────────────────────────────────────────
// Local rows -- fixed-option string selects
// ────────────────────────────────────────────────────────────

interface StringSelectRowProps {
  entry: GenericPropEntry;
  label: string;
  /** Fixed option set (the property is a free C++ string, not an enum). */
  options: { label: string; value: string }[];
  onSet: SetFn;
  onReset: ResetFn;
  disabled?: boolean;
}

/**
 * Dropdown over a fixed option set for a string-typed property (font style /
 * weight are CSS strings, not C++ enums, so they carry no `enumdef`). An
 * out-of-set current value stays selectable so a custom value round-trips.
 */
const StringSelectRow: React.FC<StringSelectRowProps> = ({
  entry,
  label,
  options,
  onSet,
  onReset,
  disabled,
}) => {
  const current = String(entry.value);
  const known = options.some((o) => o.value === current);
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={current}
        disabled={disabled || entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        {!known && <option value={current}>{current}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};

// ────────────────────────────────────────────────────────────
// Sections
// ────────────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  simple: "Simple line",
  fancy: "3D tube",
};
const CAP_LABELS: Record<string, string> = {
  flat: "Flat",
  sphere: "Round",
  arrow: "Arrow",
};

/** True when the renderer is in 3D-tube ("fancy") mode (default when absent). */
function isFancyMode(mode: GenericPropEntry | undefined): boolean {
  return mode ? String(mode.value) === "fancy" : true;
}

/**
 * "Interaction" section: drawing mode, line width, color and label toggle. The
 * width unit follows the mode (Angstrom for the 3D tube, pixels for the simple
 * line), matching the UXP unit swap.
 */
export const AtomIntrMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const mode = get("mode");
  const width = get("width");
  const color = get("color");
  const showlabel = get("showlabel");

  const widthUnit = isFancyMode(mode) ? "Å" : "px";

  return (
    <>
      {mode && (
        <MappedEnumRow
          entry={mode}
          label="Mode"
          labels={MODE_LABELS}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {width && (
        <NumRow
          entry={width}
          label="Width"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={5}
          step={0.05}
          unit={widthUnit}
        />
      )}
      {color && <ColorRow entry={color} label="Color" onSet={onSet} onReset={onReset} />}
      {showlabel && (
        <BoolRow entry={showlabel} label="Show label" onSet={onSet} onReset={onReset} />
      )}
    </>
  );
};

/** Stipple pattern keys in dash/gap order. */
const STIPPLE_KEYS = [
  "stipple0",
  "stipple1",
  "stipple2",
  "stipple3",
  "stipple4",
  "stipple5",
] as const;
/** Restored pattern when the line is switched to dashed: one dash/gap pair. */
const DASHED_ON_VALUE: Record<string, number> = { stipple0: 1, stipple1: 1 };

/** A negative stipple is the "unused segment" sentinel; show it as blank. */
function stippleDisplay(value: number): string {
  return value >= 0 ? String(value) : "";
}
/** Parse a cell's text back to a stipple value; blank / negative -> -1. */
function parseStipple(raw: string): number {
  const n = parseFloat(raw);
  return raw.trim() === "" || isNaN(n) || n < 0 ? -1 : n;
}

/**
 * "Dashed line" section: a synthetic "Dashed" toggle plus the six stipple
 * pattern lengths laid out as one compact row of dash / gap numeric cells (UXP
 * `atomintr-propdlg` "Dashed line" groupbox parity). There is no single dashed
 * property; a line is dashed when any stipple >= 0. The toggle rewrites all
 * present stipples in one undo step (off -> all -1; on -> a single dash/gap
 * pair); each cell edits one value (blank / negative means an unused segment).
 * The cells are disabled while the line is solid.
 */
export const AtomIntrDashedSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onSetMany,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const stipples = STIPPLE_KEYS.map(get);
  const present = stipples.filter((s): s is GenericPropEntry => Boolean(s));
  if (present.length === 0) return null;

  const dashedOn = present.some((s) => Number(s.value) >= 0);

  const onToggleDashed = (checked: boolean) => {
    if (!onSetMany) return;
    const writes: PropMultiWrite[] = present.map((s) => ({
      key: s.key,
      valueType: s.type,
      value: checked ? (DASHED_ON_VALUE[s.key] ?? -1) : -1,
    }));
    onSetMany(writes);
  };

  return (
    <>
      <Field label="Dashed" inline>
        <SwitchField checked={dashedOn} onChange={onToggleDashed} />
      </Field>
      <div className="atomintr-stipple-row" role="group" aria-label="Dash pattern">
        {STIPPLE_KEYS.map((key, i) => {
          const s = get(key);
          if (!s) return null;
          const caption = i % 2 === 0 ? "dash" : "gap";
          const value = Number(s.value);
          return (
            <div className="atomintr-stipple-cell" key={key}>
              <NumberCell
                value={stippleDisplay(value)}
                disabled={!dashedOn}
                aria-label={`${caption} ${Math.floor(i / 2) + 1}`}
                onCommit={(raw) => {
                  const next = parseStipple(raw);
                  if (next !== value) onSet(s.key, s.type, next);
                }}
              />
              <span className="atomintr-stipple-caption type-caption">{caption}</span>
            </div>
          );
        })}
      </div>
    </>
  );
};

/**
 * "3D tube" section: tesselation detail, the two end-cap types and the arrow
 * head size. All controls are disabled while mode is "simple" (the simple line
 * has no tube geometry). Arrow height / width are further disabled unless a cap
 * is set to "arrow".
 */
export const AtomIntrTubeSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const mode = get("mode");
  const detail = get("detail");
  const capStart = get("captype_start");
  const capEnd = get("captype_end");
  const arrowHeight = get("arrowheight");
  const arrowWidth = get("arrowwidth");

  const fancy = isFancyMode(mode);
  const tubeOff = !fancy;
  const hasArrow =
    String(capStart?.value) === "arrow" || String(capEnd?.value) === "arrow";
  const arrowOff = tubeOff || !hasArrow;

  return (
    <>
      {detail && (
        <NumRow
          entry={detail}
          label="Detail"
          onSet={onSet}
          onReset={onReset}
          min={2}
          max={20}
          step={1}
          decimals={0}
          disabled={tubeOff}
        />
      )}
      {capStart && (
        <MappedEnumRow
          entry={capStart}
          label="Start cap"
          labels={CAP_LABELS}
          onSet={onSet}
          onReset={onReset}
          disabled={tubeOff}
        />
      )}
      {capEnd && (
        <MappedEnumRow
          entry={capEnd}
          label="End cap"
          labels={CAP_LABELS}
          onSet={onSet}
          onReset={onReset}
          disabled={tubeOff}
        />
      )}
      {arrowHeight && (
        <NumRow
          entry={arrowHeight}
          label="Arrow height"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={5}
          step={0.1}
          unit="Å"
          disabled={arrowOff}
        />
      )}
      {arrowWidth && (
        <NumRow
          entry={arrowWidth}
          label="Arrow width"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={5}
          step={0.1}
          disabled={arrowOff}
        />
      )}
    </>
  );
};

const FONT_STYLE_OPTIONS = [
  { label: "Normal", value: "normal" },
  { label: "Italic", value: "italic" },
];
const FONT_WEIGHT_OPTIONS = [
  { label: "Normal", value: "normal" },
  { label: "Bold", value: "bold" },
];

/**
 * "Value label" section: the measurement-label font. These properties are not
 * in the UXP dialog but are exposed by the renderer; they are disabled while
 * label display is off so the page stays consistent with the "Show label"
 * toggle.
 */
export const AtomIntrLabelSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const showlabel = get("showlabel");
  const fontSize = get("font_size");
  const fontName = get("font_name");
  const fontStyle = get("font_style");
  const fontWeight = get("font_weight");

  // Font controls only matter while labels are shown.
  const labelOff = showlabel ? !showlabel.value : false;

  return (
    <>
      {fontSize && (
        <NumRow
          entry={fontSize}
          label="Font size"
          onSet={onSet}
          onReset={onReset}
          min={1}
          max={72}
          step={1}
          decimals={0}
          unit="pt"
          disabled={labelOff}
        />
      )}
      {fontName && (
        <TextRow
          entry={fontName}
          label="Font name"
          onSet={onSet}
          onReset={onReset}
          disabled={labelOff}
        />
      )}
      {fontStyle && (
        <StringSelectRow
          entry={fontStyle}
          label="Font style"
          options={FONT_STYLE_OPTIONS}
          onSet={onSet}
          onReset={onReset}
          disabled={labelOff}
        />
      )}
      {fontWeight && (
        <StringSelectRow
          entry={fontWeight}
          label="Font weight"
          options={FONT_WEIGHT_OPTIONS}
          onSet={onSet}
          onReset={onReset}
          disabled={labelOff}
        />
      )}
    </>
  );
};
