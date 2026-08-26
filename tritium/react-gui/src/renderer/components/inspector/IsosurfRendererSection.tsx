/**
 * @file components/inspector/IsosurfRendererSection.tsx
 * @description Type-specific property section for the isosurf renderer
 * (C++ `xtal::MapSurfRenderer`, `type_name === "isosurf"`). It draws an
 * isosurface of a scalar field (density map).
 *
 * Faithful migration of the UXP `isosurf-propdlg` "Map" tab into one accordion
 * section registered in `rendererPropSections.tsx`:
 *   - Center update         : None / Automatic / Automatic (drag)  (shared)
 *   - Region                : `region_mode` (auto / box / full)
 *   - Level of detail       : `lod` (auto / 1 / 2 / 4 / 8 stride)
 *   - LoD budget            : `lod_budget` (stepper, Mcells; full region only)
 *   - Drawing Mode          : `drawmode` (fill / line / point)
 *   - Line/Point size       : `width` (drag-numeric, px, realtime; off for fill)
 *   - Max grid size         : `max_grids` (stepper; box region only)
 *   - Back-face culling      : `cullface` (switch)
 *   - Use periodic boundary : `use_pbc` (switch; box region only)
 *   - Limit display by + Target / Selection / Distance              (shared)
 *
 * Parity note (`isosurf-propdlg.js` `updateDisabledState`): the Line/Point size
 * is disabled while the drawing mode is "fill" (it only matters for line/point
 * rendering). "Center update" and the "Limit display by" block are identical to
 * the contour renderer (both extend C++ `MapRenderer`) and come from
 * `MapRendererCommon`. Tuning props (`binning` / `glrender_mode` / ...) are not
 * on the UXP Map tab and stay out.
 *
 * Cryo-EM map mode (not on the UXP tab; see docs/architecture/cryo-em-map-mode.md):
 * "Region" selects the display region policy. Its effective value comes from
 * the read-only `region_mode_resolved` prop ("auto" follows the map kind:
 * full for cryo-EM maps, box otherwise). In the full region the whole map is
 * marched at a budget-derived stride, so the box-only knobs -- Max grid size
 * and Use periodic boundary -- are hidden, and the LoD budget is shown instead.
 *
 * @remarks Coloring is deliberately NOT on this section: the MOLFANC
 * (colormode="molecule") coloring -- mode switch, reference molecule
 * (`target`) and coloring scheme -- is edited in the Coloring panel
 * (`ColorPane`), same as molsurf. The raw `colormode` / `target` / `sel`
 * properties stay editable through the generic Properties tab.
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and its row renders nothing when the
 * property is absent. All properties are flat (no nested objects / dot-paths).
 */

import React from "react";
import {
  NumRow,
  NumInputRow,
  BoolRow,
  EnumRow,
  MappedEnumRow,
} from "./RendererCommonSection";
import { CenterUpdateRow, LimitDisplayRows } from "./MapRendererCommon";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

/** Display labels of the `region_mode` enum (raw C++ IDs stay the values). */
export const REGION_MODE_LABELS: Record<string, string> = {
  auto: "Auto",
  box: "Box around center",
  full: "Full map",
};
const REGION_MODE_ORDER = ["auto", "box", "full"];

/** Display labels of the `lod` enum (marching stride). */
export const LOD_LABELS: Record<string, string> = {
  auto: "Auto",
  step1: "1 (full resolution)",
  step2: "2",
  step4: "4",
  step8: "8",
};
const LOD_ORDER = ["auto", "step1", "step2", "step4", "step8"];

/**
 * "Isosurf" section: center update, drawing mode, line/point size, max grid
 * size, back-face culling, periodic boundary, and the shared limit-display
 * block.
 */
export const IsosurfMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
  sceneId,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const drawmode = get("drawmode");
  const width = get("width");
  const maxGrids = get("max_grids");
  const cullface = get("cullface");
  const usePbc = get("use_pbc");
  const regionMode = get("region_mode");
  const regionResolved = get("region_mode_resolved");
  const lod = get("lod");
  const lodBudget = get("lod_budget");

  // Line/Point size only matters for line / point modes (UXP updateDisabledState).
  const widthDisabled = drawmode ? String(drawmode.value) === "fill" : false;

  // Effective region policy: the read-only resolved prop when available,
  // else the raw prop (an explicit box / full; "auto" is treated as box).
  const effectiveRegion = regionResolved
    ? String(regionResolved.value)
    : regionMode && String(regionMode.value) === "full"
      ? "full"
      : "box";
  const isFull = effectiveRegion === "full";

  return (
    <>
      <CenterUpdateRow
        entries={entries}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={onReset}
      />
      {regionMode && (
        <MappedEnumRow
          entry={regionMode}
          label="Region"
          labels={REGION_MODE_LABELS}
          options={REGION_MODE_ORDER}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {lod && (
        <MappedEnumRow
          entry={lod}
          label="Level of detail"
          labels={LOD_LABELS}
          options={LOD_ORDER}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {lodBudget && isFull && (
        <NumInputRow
          key={`lod_budget:${lodBudget.value}`}
          entry={lodBudget}
          label="LoD budget"
          onSet={onSet}
          onReset={onReset}
          min={1}
          max={256}
          step={1}
          unit="Mcell"
        />
      )}
      {drawmode && (
        <EnumRow entry={drawmode} label="Drawing mode" onSet={onSet} onReset={onReset} />
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
          unit="px"
          realtime
          disabled={widthDisabled}
        />
      )}
      {maxGrids && !isFull && (
        <NumInputRow
          key={`max_grids:${maxGrids.value}`}
          entry={maxGrids}
          label="Max grid size"
          onSet={onSet}
          onReset={onReset}
          min={50}
          max={1000}
          step={10}
        />
      )}
      {cullface && (
        <BoolRow entry={cullface} label="Back-face culling" onSet={onSet} onReset={onReset} />
      )}
      {usePbc && !isFull && (
        <BoolRow
          entry={usePbc}
          label="Use periodic boundary"
          onSet={onSet}
          onReset={onReset}
        />
      )}
      <LimitDisplayRows
        entries={entries}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={onReset}
        sceneId={sceneId}
      />
    </>
  );
};
