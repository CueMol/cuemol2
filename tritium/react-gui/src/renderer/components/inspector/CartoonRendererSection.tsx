/**
 * @file components/inspector/CartoonRendererSection.tsx
 * @description Type-specific property sections for the cartoon renderer
 * (C++ `Ribbon2Renderer`, `type_name === "cartoon"`). It draws ribbon / tube
 * secondary-structure cartoons (helix / sheet / coil) along the main chain.
 *
 * Faithful migration of the UXP `cartoon-propdlg` tabs (Cartoon / Helix / Sheet
 * / Coil), including the per-secondary-structure SHAPE controls that live on
 * nested sub-objects: each of `helix` / `sheet` / `coil` / `ribhelix` is a
 * `TubeSection` (type / detail / width / tuber / sharp) and each of `sheethead`
 * / `ribhelix_head` / `ribhelix_tail` is a `JctTable` (type / gamma / basw /
 * arrow). These are reached by dotted keys (`helix.width`, `sheethead.gamma`,
 * ...); `parseGenericProps` expands the nested objects and `setProp` routes the
 * dotted path through `LPropSupport::setNestedProperty` (ADR-0015, proven by the
 * tube / nucl renderers).
 *
 * Parity notes (UXP `cartoon-hsc-page.js`):
 *   - The Helix tab is a deck switched by `helix_ribbon` (Cylinder vs Ribbon);
 *     only the active deck's controls are shown, matching the UXP `<deck>`.
 *   - The ribbon head/tail controls write BOTH `ribhelix_head.*` and
 *     `ribhelix_tail.*` in one undo step (UXP writes both); the sheet head
 *     writes the single `sheethead.*`.
 *   - "Arrow height" / "Arrow width" are percentage displays of the JctTable
 *     `basw` / `arrow` values: height% = (1 - basw) * 100, width% = (arrow - 1)
 *     * 50, inverted on commit.
 *   - Section sharpness is enabled only when the section type is "roundsquare"
 *     (the cylinder-helix / sheet / coil sections; the ribbon section is not
 *     gated). The ribbon/sheet head arrow params are enabled only for the
 *     "arrow" head type. Helix width smoothing is enabled only in "wavy" mode.
 *   - `axialdetail` and the section `detail` use the plain stepper
 *     (`NumInputRow`); other numeric sliders use the drag-numeric field (no
 *     realtime preview, single undo step).
 *   - `helix_waver` (nopersist) and `dump_curvature` (debug) are intentionally
 *     not surfaced (they are not in the UXP dialog).
 */

import React from "react";
import {
  NumRow,
  NumInputRow,
  BoolRow,
  MappedEnumRow,
  TextRow,
  SelRow,
  CAP_LABELS,
  resetProps,
} from "./RendererCommonSection";
import {
  MultiEnumRow,
  MultiNumRow,
  SECTION_TYPE_LABELS,
  SECTION_TYPES_NO_FANCY,
  JCT_TYPE_LABELS,
  JCT_TYPE_OPTIONS,
} from "./rowHelpers";
import { PropertyField, SelectField } from "../../h3-kit/form";
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';
import type { RendererPropSectionProps } from "./rendererPropSections";

// --- Local labels -------------------------------------------------------------

const HELIX_WIDTH_MODE_LABELS: Record<string, string> = {
  const: "Constant",
  average: "Average",
  wavy: "Wavy",
};

type SetFn = RendererPropSectionProps["onSet"];
type SetManyFn = RendererPropSectionProps["onSetMany"];
type ResetFn = RendererPropSectionProps["onReset"];

// --- Reusable section-shape block ---------------------------------------------

interface SectionShapeRowsProps {
  entries: GenericPropEntry[];
  onSet: SetFn;
  onReset: ResetFn;
  /** Nested object key prefix: "helix" | "sheet" | "coil" | "ribhelix". */
  prefix: string;
  /** Offer the "fancy1" section type (ribbon section only). */
  allowFancy: boolean;
  /** Expose the section width row (omitted for the cylinder-helix section). */
  includeWidth: boolean;
  /** Upper bound of the width slider (5 for ribbon, 3 for sheet / coil). */
  widthMax: number;
  detailMin: number;
  detailMax: number;
  /** Gate sharpness on the "roundsquare" type (off for the ribbon section). */
  gateSharp: boolean;
}

/**
 * The shared `TubeSection` shape rows (type / detail / [width] / tuber / sharp)
 * for one secondary-structure section, read by dotted keys `${prefix}.*`.
 */
const SectionShapeRows: React.FC<SectionShapeRowsProps> = ({
  entries,
  onSet,
  onReset,
  prefix,
  allowFancy,
  includeWidth,
  widthMax,
  detailMin,
  detailMax,
  gateSharp,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);
  const type = get(`${prefix}.type`);
  const detail = get(`${prefix}.detail`);
  const width = get(`${prefix}.width`);
  const tuber = get(`${prefix}.tuber`);
  const sharp = get(`${prefix}.sharp`);

  const sharpDisabled =
    gateSharp && type ? String(type.value) !== "roundsquare" : false;

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
      {detail && (
        <NumInputRow
          key={`${prefix}.detail:${detail.value}`}
          entry={detail}
          label="Section detail"
          onSet={onSet}
          onReset={onReset}
          min={detailMin}
          max={detailMax}
          step={1}
        />
      )}
      {includeWidth && width && (
        <NumRow
          entry={width}
          label="Section width"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={widthMax}
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
    </>
  );
};

// --- Reusable head/tail (JctTable) block --------------------------------------

interface HeadShapeRowsProps {
  entries: GenericPropEntry[];
  onSet: SetFn;
  onSetMany: SetManyFn;
  onReset: ResetFn;
  /** JctTable object key prefixes: ["sheethead"] or ["ribhelix_head","ribhelix_tail"]. */
  prefixes: string[];
}

/**
 * The shared `JctTable` head/tail rows (type / power / arrow height% / arrow
 * width%). Writes every prefix in `prefixes` so the ribbon helix updates head
 * and tail together. Arrow height / width are disabled unless the type is
 * "arrow".
 */
const HeadShapeRows: React.FC<HeadShapeRowsProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
  prefixes,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);
  const collect = (field: string) =>
    prefixes.map((p) => get(`${p}.${field}`)).filter(Boolean) as GenericPropEntry[];

  const type = collect("type");
  const gamma = collect("gamma");
  const basw = collect("basw");
  const arrow = collect("arrow");

  const notArrow = type.length ? String(type[0].value) !== "arrow" : true;

  return (
    <>
      {type.length > 0 && (
        <MultiEnumRow
          label="Cap type"
          targets={type}
          labels={JCT_TYPE_LABELS}
          options={JCT_TYPE_OPTIONS}
          onSet={onSet}
          onSetMany={onSetMany}
          onReset={onReset}
        />
      )}
      {gamma.length > 0 && (
        <MultiNumRow
          label="Cap power"
          targets={gamma}
          min={0.1}
          max={10}
          step={0.1}
          decimals={2}
          onSet={onSet}
          onSetMany={onSetMany}
          onReset={onReset}
        />
      )}
      {basw.length > 0 && (
        <MultiNumRow
          label="Arrow height"
          targets={basw}
          min={0}
          max={100}
          step={10}
          decimals={0}
          unit="%"
          toDisplay={(s) => (1 - s) * 100}
          toStored={(d) => (100 - d) / 100}
          onSet={onSet}
          onSetMany={onSetMany}
          onReset={onReset}
          disabled={notArrow}
        />
      )}
      {arrow.length > 0 && (
        <MultiNumRow
          label="Arrow width"
          targets={arrow}
          min={0}
          max={100}
          step={10}
          decimals={0}
          unit="%"
          toDisplay={(s) => (s - 1) * 50}
          toStored={(d) => d / 50 + 1}
          onSet={onSet}
          onSetMany={onSetMany}
          onReset={onReset}
          disabled={notArrow}
        />
      )}
    </>
  );
};

// --- Helix type (Cylinder / Ribbon) row ---------------------------------------

interface HelixTypeRowProps {
  entry: GenericPropEntry;
  onSet: SetFn;
  onReset: ResetFn;
}

/** "Type" selector mapping `helix_ribbon` (boolean) to Cylinder / Ribbon. */
const HelixTypeRow: React.FC<HelixTypeRowProps> = ({ entry, onSet, onReset }) => (
  <PropertyField label="Type" {...resetProps(entry, onReset)}>
    <SelectField
      value={entry.value ? "ribbon" : "cylinder"}
      disabled={entry.readonly}
      onChange={(v) => onSet(entry.key, entry.type, v === "ribbon")}
    >
      <option value="cylinder">Cylinder</option>
      <option value="ribbon">Ribbon</option>
    </SelectField>
  </PropertyField>
);

// --- Sections -----------------------------------------------------------------

/**
 * "Cartoon" section: axial detail, color smoothing, pivot atom, the two end-cap
 * types and the spline anchor (selection + weight).
 */
export const CartoonMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
  sceneId,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const axialdetail = get("axialdetail");
  const smoothcolor = get("smoothcolor");
  const pivotatom = get("pivotatom");
  const startCap = get("start_captype");
  const endCap = get("end_captype");
  const anchorSel = get("anchor_sel");
  const anchorWeight = get("anchor_weight");

  const anchorOff = anchorSel
    ? String(anchorSel.value) === "" || String(anchorSel.value) === "none"
    : true;

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
      {anchorSel && (
        <SelRow
          key={`anchor_sel:${anchorSel.value}`}
          entry={anchorSel}
          label="Anchor selection"
          onSet={onSet}
          onReset={onReset}
          sceneId={sceneId}
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
          step={1}
          decimals={1}
          disabled={anchorOff}
        />
      )}
    </>
  );
};

/**
 * "Helix" section: a Cylinder / Ribbon deck (`helix_ribbon`). Ribbon mode shows
 * the ribbon section shape (`ribhelix.*`) and the head/tail junction
 * (`ribhelix_head` + `ribhelix_tail`). Cylinder mode shows spline smoothing /
 * extend, the cylinder section shape (`helix.*`) and the width mode parameters.
 */
export const CartoonHelixSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const ribbon = get("helix_ribbon");
  const widthMode = get("helix_width_mode");
  const wplus = get("helix_wplus");
  const wsmooth = get("helix_wsmooth");
  const smooth = get("helix_smooth");
  const extend = get("helix_extend");

  const isRibbon = ribbon ? Boolean(ribbon.value) : false;
  const mode = widthMode ? String(widthMode.value) : "average";
  const wsmoothOff = mode !== "wavy";

  return (
    <>
      {ribbon && <HelixTypeRow entry={ribbon} onSet={onSet} onReset={onReset} />}

      {isRibbon ? (
        <>
          <SectionShapeRows
            entries={entries}
            onSet={onSet}
            onReset={onReset}
            prefix="ribhelix"
            allowFancy
            includeWidth
            widthMax={5}
            detailMin={4}
            detailMax={20}
            gateSharp={false}
          />
          <HeadShapeRows
            entries={entries}
            onSet={onSet}
            onSetMany={onSetMany}
            onReset={onReset}
            prefixes={["ribhelix_head", "ribhelix_tail"]}
          />
        </>
      ) : (
        <>
          {smooth && (
            <NumRow
              entry={smooth}
              label="Smoothing"
              onSet={onSet}
              onReset={onReset}
              min={-5}
              max={5}
              step={0.1}
              decimals={1}
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
              step={0.05}
              decimals={2}
              unit="Å"
            />
          )}
          <SectionShapeRows
            entries={entries}
            onSet={onSet}
            onReset={onReset}
            prefix="helix"
            allowFancy={false}
            includeWidth={false}
            widthMax={5}
            detailMin={4}
            detailMax={50}
            gateSharp
          />
          {widthMode && (
            <MappedEnumRow
              entry={widthMode}
              label="Width mode"
              labels={HELIX_WIDTH_MODE_LABELS}
              onSet={onSet}
              onReset={onReset}
            />
          )}
          {wplus && (
            <NumRow
              entry={wplus}
              label="Add width"
              onSet={onSet}
              onReset={onReset}
              min={-2}
              max={3}
              step={0.05}
              decimals={2}
              unit="Å"
            />
          )}
          {wsmooth && (
            <NumRow
              entry={wsmooth}
              label="Width smooth"
              onSet={onSet}
              onReset={onReset}
              min={-5}
              max={5}
              step={0.1}
              decimals={1}
              disabled={wsmoothOff}
            />
          )}
        </>
      )}
    </>
  );
};

/**
 * "Sheet" section: spline smoothing, the sheet section shape (`sheet.*`), width
 * smoothing and the sheet head junction (`sheethead.*`).
 */
export const CartoonSheetSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onSetMany,
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
          label="Smoothing"
          onSet={onSet}
          onReset={onReset}
          min={-5}
          max={5}
          step={0.1}
          decimals={1}
        />
      )}
      <SectionShapeRows
        entries={entries}
        onSet={onSet}
        onReset={onReset}
        prefix="sheet"
        allowFancy={false}
        includeWidth
        widthMax={3}
        detailMin={2}
        detailMax={20}
        gateSharp
      />
      {wsmooth && (
        <NumRow
          entry={wsmooth}
          label="Width smooth"
          onSet={onSet}
          onReset={onReset}
          min={-5}
          max={5}
          step={0.1}
          decimals={1}
        />
      )}
      <HeadShapeRows
        entries={entries}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={onReset}
        prefixes={["sheethead"]}
      />
    </>
  );
};

/** "Coil" section: coil spline smoothing and the coil section shape (`coil.*`). */
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
          label="Smoothing"
          onSet={onSet}
          onReset={onReset}
          min={-5}
          max={5}
          step={0.1}
          decimals={1}
        />
      )}
      <SectionShapeRows
        entries={entries}
        onSet={onSet}
        onReset={onReset}
        prefix="coil"
        allowFancy={false}
        includeWidth
        widthMax={3}
        detailMin={4}
        detailMax={20}
        gateSharp
      />
    </>
  );
};
