/**
 * @file components/inspector/ContourRendererSection.tsx
 * @description Type-specific property section for the contour renderer
 * (C++ `xtal::MapMeshRenderer`, `type_name === "contour"`). It draws a
 * wireframe contour mesh of a scalar field (density map).
 *
 * Faithful migration of the UXP `contour-propdlg` "Map" tab into one accordion
 * section registered in `rendererPropSections.tsx`:
 *   - Center update         : None / Automatic / Automatic (drag)
 *   - Line width            : `width` (drag-numeric, px, realtime preview)
 *   - Buffer size           : `bufsize` (stepper)
 *   - Use periodic boundary : `use_pbc` (switch)
 *   - Limit display by       : groupbox-style enable toggle (derived state)
 *   - Target / Selection / Distance : display-limit target molecule + selection
 *
 * "Center update" and the whole "Limit display by" block are shared with the
 * isosurf renderer (both extend C++ `MapRenderer`) and live in
 * `MapRendererCommon` as a single source of truth. Coloring (`colormode` /
 * `color` / `siglevel` / `extent` / ...) is not on the UXP Map tab and stays
 * out (it belongs to a separate panel).
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and its row renders nothing when the
 * property is absent. All properties are flat (no nested objects / dot-paths).
 */

import React from "react";
import { NumRow, NumInputRow, BoolRow } from "./RendererCommonSection";
import {
  CenterUpdateRow,
  LimitDisplayRows,
  RegionLodRows,
  effectiveRegionMode,
} from "./MapRendererCommon";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

/**
 * "Contour" section: center update, region / level of detail (cryo-EM map
 * mode; buffer size and periodic boundary are box-region only), line width,
 * and the shared limit-display block.
 */
export const ContourMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
  sceneId,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const width = get("width");
  const bufsize = get("bufsize");
  const usePbc = get("use_pbc");

  // In the full region (cryo-EM maps) the whole map is generated at the
  // budget stride, so the box-only knobs (buffer size, periodic boundary)
  // do not apply.
  const isFull = effectiveRegionMode(entries) === "full";

  return (
    <>
      <CenterUpdateRow
        entries={entries}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={onReset}
      />
      <RegionLodRows entries={entries} onSet={onSet} onReset={onReset} />
      {width && (
        <NumRow
          entry={width}
          label="Line width"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={10}
          step={0.1}
          unit="px"
          realtime
        />
      )}
      {bufsize && !isFull && (
        <NumInputRow
          key={`bufsize:${bufsize.value}`}
          entry={bufsize}
          label="Buffer size"
          onSet={onSet}
          onReset={onReset}
          min={50}
          max={200}
          step={10}
        />
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
