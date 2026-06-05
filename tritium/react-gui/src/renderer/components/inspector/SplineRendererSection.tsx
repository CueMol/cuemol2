/**
 * @file components/inspector/SplineRendererSection.tsx
 * @description Type-specific property section for the spline renderer
 * (C++ `SplineRenderer`, `type_name === "spline"`). It draws a smooth curve
 * line along the main chain.
 *
 * The spline renderer has no dedicated UXP property dialog (only the generic
 * renderer dialog), so this curated page is derived from the C++
 * `SplineRenderer.qif` properties. Structurally it is a subset of the tube
 * renderer's main section (`TubeMainSection`): spline has no nested cross-section
 * object and no putty, so it is a single accordion section.
 *
 * Scope notes:
 *   - `start_captype` / `end_captype` exist on the C++ side (inherited tube cap
 *     enums) but are intentionally NOT exposed: caps only apply to tube
 *     cross-sections, not to spline's line geometry, so they are non-functional
 *     here.
 *   - `pivotatom` uses a plain text row (empty = default Calpha pivot).
 *   - `line_width` and `smooth` use realtime drag (live preview + single undo
 *     step); `axialdetail` uses a plain stepper (`NumInputRow`).
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and its row renders nothing when the
 * property is absent (mirroring the UXP `findPropData` null checks).
 */

import React from "react";
import { NumRow, NumInputRow, BoolRow, TextRow } from "./RendererCommonSection";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

/**
 * "Spline" section: axial tessellation detail, spline smoothness, color
 * smoothing, line width, segment-end fade and the pivot atom name. The two
 * tube cap-type properties are deliberately omitted (non-functional on a line).
 */
export const SplineMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const axialdetail = get("axialdetail");
  const smooth = get("smooth");
  const smoothcolor = get("smoothcolor");
  const lineWidth = get("line_width");
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
          realtime
        />
      )}
      {smoothcolor && (
        <BoolRow entry={smoothcolor} label="Smooth color" onSet={onSet} onReset={onReset} />
      )}
      {lineWidth && (
        <NumRow
          entry={lineWidth}
          label="Line width"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={10}
          step={0.2}
          unit="px"
          realtime
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
      {pivotatom && (
        <TextRow
          key={`pivotatom:${pivotatom.value}`}
          entry={pivotatom}
          label="Pivot atom name"
          onSet={onSet}
          onReset={onReset}
        />
      )}
    </>
  );
};
