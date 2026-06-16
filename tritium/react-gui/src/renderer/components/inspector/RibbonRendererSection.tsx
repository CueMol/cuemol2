/**
 * @file components/inspector/RibbonRendererSection.tsx
 * @description Type-specific property sections for the ribbon renderer
 * (C++ `molvis::RibbonRenderer`, `type_name === "ribbon"`). It draws a classic
 * secondary-structure ribbon (helix / sheet / coil) along the main chain.
 *
 * Faithful migration of the UXP `ribbon-propdlg` tabs (Common / Helix / Sheet /
 * Coil). The per-secondary-structure section shapes live on nested `TubeSection`
 * objects (`helix` / `sheet` / `coil`) and the head/tail junctions on nested
 * `JctTable` objects (`helixhead` / `helixtail` / `sheethead` / `sheettail`),
 * edited by dotted keys (`helix.width`, `helixhead.gamma`, ...) via the
 * dot-path mechanism proven by tube / cartoon / nucl (ADR-0015).
 *
 * Parity notes (`ribbon-propdlg.js` / `ribbon-hsc-page.js`):
 *   - "Section detail" on the Common tab writes the detail of all three
 *     sections (`coil.detail` + `helix.detail` + `sheet.detail`) in one undo
 *     step; "Cap type" writes both `start_captype` and `end_captype`.
 *   - Head and Tail are independent junctions (each writes its own object), not
 *     a single combined control.
 *   - "Arrow height" / "Arrow width" are percentage displays of the JctTable
 *     `basw` / `arrow` values: height% = (1 - basw) * 100, width% = (arrow - 1)
 *     * 50, inverted on commit.
 *   - Section sharpness is enabled only for the "roundsquare" / "fancy1" types;
 *     the head/tail arrow params only for the "arrow" junction type; the back /
 *     side colour picker only when its "use" checkbox is on.
 *   - Only properties present in the UXP dialog are exposed; the SplineRenderer
 *     base `smooth` and `line_width` are intentionally omitted.
 *
 * NOTE: the percentage rows, junction block and multi-target writes mirror the
 * cartoon renderer's helpers; promoting a shared section/junction module reused
 * by tube / cartoon / ribbon is a worthwhile follow-up (kept local here to
 * avoid refactoring the freshly-landed cartoon page in the same change).
 */

import React from "react";
import {
  NumRow,
  NumInputRow,
  BoolRow,
  ColorRow,
  MappedEnumRow,
  TextRow,
  CAP_LABELS,
} from "./RendererCommonSection";
import {
  MultiEnumRow,
  MultiNumInputRow,
  PctRow,
  SECTION_TYPE_LABELS,
  SECTION_TYPES_NO_FANCY,
  SHARP_TYPES,
  JCT_TYPE_LABELS,
  JCT_TYPE_OPTIONS,
} from "./rowHelpers";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

// --- Labels -------------------------------------------------------------------

/** Cap type option order matching the UXP single menulist. */
const CAP_TYPE_OPTIONS = ["flat", "sphere", "none"];

type SetFn = RendererPropSectionProps["onSet"];
type ResetFn = RendererPropSectionProps["onReset"];

// --- Reusable blocks ----------------------------------------------------------

interface RibbonSectionRowsProps {
  entries: GenericPropEntry[];
  onSet: SetFn;
  onReset: ResetFn;
  /** Nested TubeSection key prefix: "helix" | "sheet" | "coil". */
  prefix: string;
  /** Offer the "fancy1" section type (helix / sheet; not coil). */
  allowFancy: boolean;
  /** Optional back/side colour: the use-flag key, the colour key and its label. */
  colorUseKey?: string;
  colorKey?: string;
  colorLabel?: string;
}

/**
 * One ribbon section's shape rows: type, optional back/side colour, width,
 * tuber, sharpness (gated by type) and smoothness (the flat `${prefix}_smooth`).
 */
const RibbonSectionRows: React.FC<RibbonSectionRowsProps> = ({
  entries,
  onSet,
  onReset,
  prefix,
  allowFancy,
  colorUseKey,
  colorKey,
  colorLabel,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);
  const type = get(`${prefix}.type`);
  const width = get(`${prefix}.width`);
  const tuber = get(`${prefix}.tuber`);
  const sharp = get(`${prefix}.sharp`);
  const smooth = get(`${prefix}_smooth`);
  const colorUse = colorUseKey ? get(colorUseKey) : undefined;
  const color = colorKey ? get(colorKey) : undefined;

  const sharpDisabled = type ? !SHARP_TYPES.has(String(type.value)) : false;
  const colorOff = colorUse ? !colorUse.value : true;

  return (
    <>
      {type && (
        <MappedEnumRow
          entry={type}
          label="Section type"
          labels={SECTION_TYPE_LABELS}
          options={allowFancy ? undefined : SECTION_TYPES_NO_FANCY}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {colorUse && colorLabel && (
        <BoolRow
          entry={colorUse}
          label={`Use ${colorLabel.toLowerCase()}`}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {color && colorLabel && (
        <ColorRow
          entry={color}
          label={colorLabel}
          onSet={onSet}
          onReset={onReset}
          disabled={colorOff}
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
          decimals={2}
          unit="Å"
        />
      )}
      {tuber && (
        <NumRow
          entry={tuber}
          label="Tuber"
          onSet={onSet}
          onReset={onReset}
          min={0.2}
          max={10}
          step={0.1}
          decimals={1}
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
          disabled={sharpDisabled}
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
        />
      )}
    </>
  );
};

interface JunctionRowsProps {
  entries: GenericPropEntry[];
  onSet: SetFn;
  onReset: ResetFn;
  /** JctTable key prefix: "helixhead" | "helixtail" | "sheethead" | "sheettail". */
  prefix: string;
  /** Row-label prefix: "Head" | "Tail". */
  label: string;
}

/** One junction (head or tail): type, power, arrow height% and arrow width%. */
const JunctionRows: React.FC<JunctionRowsProps> = ({
  entries,
  onSet,
  onReset,
  prefix,
  label,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);
  const type = get(`${prefix}.type`);
  const gamma = get(`${prefix}.gamma`);
  const basw = get(`${prefix}.basw`);
  const arrow = get(`${prefix}.arrow`);

  const notArrow = type ? String(type.value) !== "arrow" : true;

  return (
    <>
      {type && (
        <MappedEnumRow
          entry={type}
          label={`${label} type`}
          labels={JCT_TYPE_LABELS}
          options={JCT_TYPE_OPTIONS}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {gamma && (
        <NumRow
          entry={gamma}
          label={`${label} power`}
          onSet={onSet}
          onReset={onReset}
          min={0.1}
          max={10}
          step={0.1}
          decimals={2}
        />
      )}
      {basw && (
        <PctRow
          label={`${label} arrow height`}
          entry={basw}
          min={0}
          max={100}
          step={10}
          toDisplay={(s) => (1 - s) * 100}
          toStored={(d) => (100 - d) / 100}
          onSet={onSet}
          onReset={onReset}
          disabled={notArrow}
        />
      )}
      {arrow && (
        <PctRow
          label={`${label} arrow width`}
          entry={arrow}
          min={0}
          max={100}
          step={10}
          toDisplay={(s) => (s - 1) * 50}
          toStored={(d) => d / 50 + 1}
          onSet={onSet}
          onReset={onReset}
          disabled={notArrow}
        />
      )}
    </>
  );
};

// --- Sections -----------------------------------------------------------------

/**
 * "Ribbon" section (UXP Common tab): section detail (all three sections at
 * once), axial detail, smooth color, pivot atom, cap type (both ends) and
 * segment-end fade.
 */
export const RibbonMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const coilDetail = get("coil.detail");
  const helixDetail = get("helix.detail");
  const sheetDetail = get("sheet.detail");
  const detailTargets = [coilDetail, helixDetail, sheetDetail].filter(
    Boolean,
  ) as GenericPropEntry[];

  const axialdetail = get("axialdetail");
  const smoothcolor = get("smoothcolor");
  const pivotatom = get("pivotatom");
  const startCap = get("start_captype");
  const endCap = get("end_captype");
  const capTargets = [startCap, endCap].filter(Boolean) as GenericPropEntry[];
  const segendFade = get("segend_fade");

  return (
    <>
      {detailTargets.length > 0 && (
        <MultiNumInputRow
          key={`sectdet:${detailTargets[0].value}`}
          label="Section detail"
          targets={detailTargets}
          min={2}
          max={20}
          step={1}
          onSet={onSet}
          onSetMany={onSetMany}
          onReset={onReset}
        />
      )}
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
        />
      )}
      {smoothcolor && (
        <BoolRow entry={smoothcolor} label="Smooth color" onSet={onSet} onReset={onReset} />
      )}
      {pivotatom && (
        <TextRow
          key={`pivotatom:${pivotatom.value}`}
          entry={pivotatom}
          label="Pivot atom name"
          placeholder="(default)"
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {capTargets.length > 0 && (
        <MultiEnumRow
          label="Cap type"
          targets={capTargets}
          labels={CAP_LABELS}
          options={CAP_TYPE_OPTIONS}
          onSet={onSet}
          onSetMany={onSetMany}
          onReset={onReset}
        />
      )}
      {segendFade && (
        <BoolRow
          entry={segendFade}
          label="Segment-end fade out"
          onSet={onSet}
          onReset={onReset}
        />
      )}
    </>
  );
};

/** "Helix" section: helix shape + back colour, helix head and helix tail. */
export const RibbonHelixSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => (
  <>
    <RibbonSectionRows
      entries={entries}
      onSet={onSet}
      onReset={onReset}
      prefix="helix"
      allowFancy
      colorUseKey="helix_usebackcol"
      colorKey="helix_backcol"
      colorLabel="Back color"
    />
    <JunctionRows entries={entries} onSet={onSet} onReset={onReset} prefix="helixhead" label="Head" />
    <JunctionRows entries={entries} onSet={onSet} onReset={onReset} prefix="helixtail" label="Tail" />
  </>
);

/** "Sheet" section: sheet shape + side colour, sheet head and sheet tail. */
export const RibbonSheetSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => (
  <>
    <RibbonSectionRows
      entries={entries}
      onSet={onSet}
      onReset={onReset}
      prefix="sheet"
      allowFancy
      colorUseKey="sheet_usesidecol"
      colorKey="sheet_sidecol"
      colorLabel="Side color"
    />
    <JunctionRows entries={entries} onSet={onSet} onReset={onReset} prefix="sheethead" label="Head" />
    <JunctionRows entries={entries} onSet={onSet} onReset={onReset} prefix="sheettail" label="Tail" />
  </>
);

/** "Coil" section: coil shape only (no fancy1 type, no colour, no head/tail). */
export const RibbonCoilSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => (
  <RibbonSectionRows
    entries={entries}
    onSet={onSet}
    onReset={onReset}
    prefix="coil"
    allowFancy={false}
  />
);
