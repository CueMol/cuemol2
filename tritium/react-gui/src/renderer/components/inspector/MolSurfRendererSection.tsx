/**
 * @file components/inspector/MolSurfRendererSection.tsx
 * @description Type-specific property section for the molsurf renderer
 * (C++ `surface::MolSurfRenderer`, `type_name === "molsurf"`). It draws a
 * precomputed molecular surface and can show it limited to a selection of a
 * reference molecule.
 *
 * Migrated from the UXP `molsurf-propdlg` "MolSurf" tab (the shared
 * `molsurf-page.xul` overlay; the "Common" tab is `RendererCommonSection`).
 * The page is shared with dsurface but `molsurf-page.js` branches by renderer
 * type: for molsurf the Surface type / Detail controls are disabled (no such
 * props) while the "Selection mol" target IS active (disabled for dsurface).
 * So this is a separate section from `DSurfaceRendererSection`.
 *
 * Rows (UXP row order, molsurf-applicable):
 *   - Drawing mode   : `drawmode` (fill / line / point)
 *   - Line/Point size: `width` (drag-numeric, px, realtime; off while filled)
 *   - Selection mol  : `target` (reference MolCoord object name)
 *   - Selection      : `showsel` (atoms to draw the surface around)
 *
 * Parity note (`molsurf-page.js` `updateDisabledState`): Line/Point size is
 * disabled while the drawing mode is "fill". The elepot / ramp coloring params
 * are owned by the Coloring panel (not on the MolSurf tab) and stay out.
 *
 * @remarks The UXP "Coloring mode" menulist (`colormode`) is deliberately NOT
 * on this section: every mode it offered is reachable from the Coloring panel
 * (`ColorPane`) -- Solid coloring -> "solid", Paint/CPK/Bfac/Rainbow ->
 * "molecule", Electrostatic potential -> "potential", Multi-gradient coloring
 * -> "multigrad" -- and only the panel can edit the colors that go with the
 * mode. Same Inspector/Coloring-panel split as isosurf and dsurface. The raw
 * `colormode` property stays editable through the Generic tab.
 *
 * `target` / `showsel` stay here: they also drive which part of the surface is
 * drawn, and the panel's "Coloring mol" selector only appears while
 * `colormode === "molecule"`.
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and its row renders nothing when the
 * property is absent. All properties are flat (no nested objects / dot-paths).
 */

import React from "react";
import { NumRow, SelRow, MappedEnumRow } from "./RendererCommonSection";
import { MolTargetRow, useMolObjectNames } from "./MapRendererCommon";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

/** Drawing-mode labels, shared with the dsurface surface section. */
const DRAWMODE_LABELS: Record<string, string> = {
  fill: "Fill",
  line: "Wireframe",
  point: "Dots",
};

/**
 * "MolSurf" section: drawing mode, line/point size, the reference-molecule
 * target and the shown selection.
 */
export const MolSurfMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
  sceneId,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);
  const molNames = useMolObjectNames(sceneId);

  const drawmode = get("drawmode");
  const width = get("width");
  const target = get("target");
  const showsel = get("showsel");

  // Line/Point size only matters for line / point modes (UXP updateDisabledState).
  const widthDisabled = drawmode ? String(drawmode.value) === "fill" : false;

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
          realtime
          disabled={widthDisabled}
        />
      )}
      {target && (
        <MolTargetRow
          entry={target}
          label="Selection mol"
          names={molNames}
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {showsel && (
        <SelRow
          entry={showsel}
          label="Selection"
          onSet={onSet}
          onReset={onReset}
          sceneId={sceneId}
        />
      )}
    </>
  );
};
