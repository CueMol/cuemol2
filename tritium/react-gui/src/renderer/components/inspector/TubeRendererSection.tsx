/**
 * @file components/inspector/TubeRendererSection.tsx
 * @description Type-specific property sections for the tube renderer
 * (C++ `TubeRenderer`, `type_name === "tube"`). It draws a smooth tube along the
 * main chain whose cross-section shape lives on a nested `TubeSection` object.
 *
 * Migrated from the UXP `tube-propdlg` "Tube" tab. The editable properties map
 * to three accordion sections registered in `rendererPropSections.tsx`:
 *   - "Tube"    : axial detail / smoothness / smooth color / start+end cap /
 *                 segment-end fade / pivot atom
 *   - "Section" : cross-section type / detail / Width1 / Width2 / sharpness
 *   - "Putty"   : putty mode / target / low+high scale
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and its row renders nothing when the
 * property is absent (mirroring the UXP `findPropData` null checks).
 *
 * Parity / scope notes:
 *   - The cross-section shape props live on the renderer's nested `section`
 *     (`TubeSection`) object and are written via their dot-path keys
 *     (`section.type`, `section.width`, ...). `parseGenericProps` expands the
 *     children and `cuemol2::setProp` routes dot-paths through
 *     `LPropSupport::setNestedProperty`, so these are first-class editable.
 *   - Width1 / Width2 are the two cross-section axis sizes in Angstroms, edited
 *     independently like the UXP tube page. They map onto the stored major-size
 *     + ratio pair: Width1 = `section.width`, Width2 = `section.tuber * width`.
 *     Editing one axis rewrites the width/tuber pair so the other axis keeps its
 *     size (Width1 edit -> width + tuber in one undo step; Width2 edit -> tuber).
 *   - UXP uses a single "Cap type" control writing both start and end; here the
 *     two cap-type properties are exposed as separate rows, matching the sibling
 *     `CartoonRendererSection` and keeping per-property reset clean.
 *   - `pivotatom` uses a plain text row; empty falls back to the per-polymer
 *     default pivot atom resolved by the C++ side (shown via a "(default)"
 *     placeholder). The UXP checkbox + textbox combo is replaced by the standard
 *     modified bar / reset.
 *   - Drag-numeric rows commit on drag end / Enter (no realtime preview); the
 *     "detail" rows use a plain stepper (`NumInputRow`).
 */

import React from "react";
import {
  NumRow,
  NumInputRow,
  BoolRow,
  TextRow,
  MappedEnumRow,
  CAP_LABELS,
  resetProps,
} from "./RendererCommonSection";
import { SECTION_TYPE_LABELS, SHARP_TYPES } from "./rowHelpers";
import { PropertyField, DragNumericField } from "../../h3-kit/form";
import { useRealtimeDragProp } from "@renderer/hooks/react/useRealtimeDragProp";
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';
import type { RendererPropSectionProps, PropMultiWrite } from "./rendererPropSections";

// --- Local labels -------------------------------------------------------------

const PUTTY_MODE_LABELS: Record<string, string> = {
  none: "None",
  linear1: "Linear",
  scale1: "Scale",
};
const PUTTY_TGT_LABELS: Record<string, string> = {
  bfac: "B-factor",
  occ: "Occupancy",
};

// --- Local rows ---------------------------------------------------------------
//
// The cross-section is stored as `section.width` (the major-axis size in Å) and
// `section.tuber` (the minor/major ratio). The UI instead presents two
// independent direct axis sizes, matching the UXP tube page:
//   Width1 = major axis = section.width
//   Width2 = minor axis = section.tuber * section.width
// Editing one axis must NOT move the other, so the width/tuber pair is rewritten
// to keep both displayed sizes consistent:
//   - Width1 -> W1': section.width = W1', section.tuber = (tuber*width) / W1'
//     (preserves Width2; one undo step via onSetMany).
//   - Width2 -> W2': section.tuber = W2' / width (section.width unchanged, so
//     Width1 is preserved).

interface Width1RowProps {
  /** `section.width` entry (the major-axis Width1). */
  widthEntry: GenericPropEntry;
  /** `section.tuber` entry (rewritten so Width2 stays put). */
  tuberEntry: GenericPropEntry;
  onSetMany: RendererPropSectionProps["onSetMany"];
  onReset: RendererPropSectionProps["onReset"];
  disabled?: boolean;
}

/**
 * "Width1" (major axis) row. Commits `section.width` and, in the same undo step,
 * rewrites `section.tuber` so the minor axis (Width2 = tuber * width) keeps its
 * absolute size - the two axes stay independent. The modified bar / reset map to
 * `section.width`.
 */
const Width1Row: React.FC<Width1RowProps> = ({
  widthEntry,
  tuberEntry,
  onSetMany,
  onReset,
  disabled,
}) => {
  const width = Number(widthEntry.value);
  const tuber = Number(tuberEntry.value);
  // Minor-axis absolute size to preserve across a major-axis edit.
  const minor = tuber * width;
  const dragProps = useRealtimeDragProp({
    committed: width,
    committedIsDefault: widthEntry.isdefault,
    realtime: false,
    onPreview: () => {},
    onCommit: (original, v) => {
      if (v === original || !(v > 0)) return;
      const writes: PropMultiWrite[] = [
        { key: widthEntry.key, valueType: widthEntry.type, value: v },
        { key: tuberEntry.key, valueType: tuberEntry.type, value: minor / v },
      ];
      onSetMany?.(writes);
    },
  });
  return (
    <PropertyField label="Width1" {...resetProps(widthEntry, onReset)}>
      <DragNumericField
        {...dragProps}
        min={0}
        max={5}
        step={0.01}
        decimals={2}
        unit="Å"
        disabled={disabled || widthEntry.readonly || !onSetMany}
      />
    </PropertyField>
  );
};

interface Width2RowProps {
  /** `section.width` entry (the major-axis Width1; the divisor). */
  widthEntry: GenericPropEntry;
  /** `section.tuber` entry (the minor/major ratio written on commit). */
  tuberEntry: GenericPropEntry;
  onSet: RendererPropSectionProps["onSet"];
  onReset: RendererPropSectionProps["onReset"];
  disabled?: boolean;
}

/**
 * "Width2" (minor axis) row: displays `tuber * width` and, on commit, writes
 * `section.tuber = newWidth2 / width`. `section.width` (Width1) is left
 * untouched, so the major axis is preserved. The modified bar / reset map to
 * `section.tuber`.
 */
const Width2Row: React.FC<Width2RowProps> = ({
  widthEntry,
  tuberEntry,
  onSet,
  onReset,
  disabled,
}) => {
  const width = Number(widthEntry.value);
  const tuber = Number(tuberEntry.value);
  const dragProps = useRealtimeDragProp({
    committed: tuber * width,
    committedIsDefault: tuberEntry.isdefault,
    realtime: false,
    onPreview: () => {},
    onCommit: (original, v) => {
      if (v === original || !(width > 0)) return;
      onSet(tuberEntry.key, tuberEntry.type, v / width);
    },
  });
  return (
    <PropertyField label="Width2" {...resetProps(tuberEntry, onReset)}>
      <DragNumericField
        {...dragProps}
        min={0}
        max={5}
        step={0.01}
        decimals={2}
        unit="Å"
        disabled={disabled || tuberEntry.readonly}
      />
    </PropertyField>
  );
};

// --- Sections -----------------------------------------------------------------

/**
 * Props for the tube property sections. `disabled` lets a host (e.g. the nucl
 * renderer's "Show tube" gate) disable the whole section at once; it is left
 * undefined for the tube renderer itself, preserving the original behaviour.
 */
export type TubeSectionComponentProps = RendererPropSectionProps & {
  disabled?: boolean;
};

/**
 * "Tube" section: axial tessellation detail, spline smoothness, color
 * smoothing, the two end-cap types, segment-end fade and the pivot atom name.
 */
export const TubeMainSection: React.FC<TubeSectionComponentProps> = ({
  entries,
  onSet,
  onReset,
  disabled,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const axialdetail = get("axialdetail");
  const smooth = get("smooth");
  const smoothcolor = get("smoothcolor");
  const startCap = get("start_captype");
  const endCap = get("end_captype");
  const segendFade = get("segend_fade");
  const pivotatom = get("pivotatom");

  return (
    <>
      {axialdetail && (
        <NumInputRow
          key={`axialdetail:${axialdetail.value}`}
          entry={axialdetail}
          label="Axial detail"
          onSet={onSet}
          onReset={onReset}
          min={2}
          max={20}
          step={1}
          disabled={disabled}
        />
      )}
      {smooth && (
        <NumRow
          entry={smooth}
          label="Smoothness"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={0.5}
          step={0.01}
          decimals={2}
          disabled={disabled}
        />
      )}
      {smoothcolor && (
        <BoolRow
          entry={smoothcolor}
          label="Smooth color"
          onSet={onSet}
          onReset={onReset}
          disabled={disabled}
        />
      )}
      {startCap && (
        <MappedEnumRow
          entry={startCap}
          label="Start cap"
          labels={CAP_LABELS}
          onSet={onSet}
          onReset={onReset}
          disabled={disabled}
        />
      )}
      {endCap && (
        <MappedEnumRow
          entry={endCap}
          label="End cap"
          labels={CAP_LABELS}
          onSet={onSet}
          onReset={onReset}
          disabled={disabled}
        />
      )}
      {segendFade && (
        <BoolRow
          entry={segendFade}
          label="Segment-end fade out"
          onSet={onSet}
          onReset={onReset}
          disabled={disabled}
        />
      )}
      {pivotatom && (
        <TextRow
          key={`pivotatom:${pivotatom.value}`}
          entry={pivotatom}
          label="Pivot atom name"
          placeholder="(default)"
          onSet={onSet}
          onReset={onReset}
          disabled={disabled}
        />
      )}
    </>
  );
};

/**
 * "Section" section: the nested `TubeSection` cross-section shape -- type, side
 * detail, the two independent axis sizes (Width1 = major axis = `section.width`,
 * Width2 = minor axis = `section.tuber` * width) and sharpness. Editing Width1
 * rewrites `section.tuber` so Width2 stays put (see `Width1Row`). Sharpness is
 * enabled only for the square / fancy section types, matching the UXP
 * `updateDisabledState` logic.
 */
export const TubeSectionSection: React.FC<TubeSectionComponentProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
  disabled,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const type = get("section.type");
  const detail = get("section.detail");
  const width = get("section.width");
  const tuber = get("section.tuber");
  const sharp = get("section.sharp");

  const sharpOff = type ? !SHARP_TYPES.has(String(type.value)) : false;

  return (
    <>
      {type && (
        <MappedEnumRow
          entry={type}
          label="Type"
          labels={SECTION_TYPE_LABELS}
          onSet={onSet}
          onReset={onReset}
          disabled={disabled}
        />
      )}
      {detail && (
        <NumInputRow
          key={`section.detail:${detail.value}`}
          entry={detail}
          label="Detail"
          onSet={onSet}
          onReset={onReset}
          min={2}
          max={20}
          step={1}
          disabled={disabled}
        />
      )}
      {width && tuber && (
        <Width1Row
          widthEntry={width}
          tuberEntry={tuber}
          onSetMany={onSetMany}
          onReset={onReset}
          disabled={disabled}
        />
      )}
      {/* No tuber: edit the major axis directly (cannot preserve a minor axis). */}
      {width && !tuber && (
        <NumRow
          entry={width}
          label="Width1"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={5}
          step={0.01}
          decimals={2}
          unit="Å"
          disabled={disabled}
        />
      )}
      {width && tuber && (
        <Width2Row
          widthEntry={width}
          tuberEntry={tuber}
          onSet={onSet}
          onReset={onReset}
          disabled={disabled}
        />
      )}
      {sharp && (
        <NumRow
          entry={sharp}
          label="Sharpness"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={1}
          step={0.05}
          decimals={2}
          disabled={disabled || sharpOff}
        />
      )}
    </>
  );
};

/**
 * "Putty" section: scales the tube radius by a per-residue scalar (B-factor or
 * occupancy). The target / scale rows are disabled when the mode is "none",
 * matching the UXP `updateDisabledState` logic.
 */
export const TubePuttySection: React.FC<TubeSectionComponentProps> = ({
  entries,
  onSet,
  onReset,
  disabled,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const mode = get("putty_mode");
  const tgt = get("putty_tgt");
  const loscl = get("putty_loscl");
  const hiscl = get("putty_hiscl");

  const puttyOff = mode ? String(mode.value) === "none" : false;

  return (
    <>
      {mode && (
        <MappedEnumRow
          entry={mode}
          label="Mode"
          labels={PUTTY_MODE_LABELS}
          onSet={onSet}
          onReset={onReset}
          disabled={disabled}
        />
      )}
      {tgt && (
        <MappedEnumRow
          entry={tgt}
          label="Target"
          labels={PUTTY_TGT_LABELS}
          onSet={onSet}
          onReset={onReset}
          disabled={disabled || puttyOff}
        />
      )}
      {loscl && (
        <NumRow
          entry={loscl}
          label="Low scale"
          onSet={onSet}
          onReset={onReset}
          min={0.1}
          max={10}
          step={0.1}
          decimals={1}
          disabled={disabled || puttyOff}
        />
      )}
      {hiscl && (
        <NumRow
          entry={hiscl}
          label="High scale"
          onSet={onSet}
          onReset={onReset}
          min={0.1}
          max={10}
          step={0.1}
          decimals={1}
          disabled={disabled || puttyOff}
        />
      )}
    </>
  );
};
