/**
 * @file components/inspector/AnIsoURendererSection.tsx
 * @description Type-specific property section for the anisotropic-displacement
 * molecular renderer (C++ `AnIsoURenderer`, `type_name === "anisou"`).
 *
 * `AnIsoURenderer` extends `BallStickRenderer` and draws ORTEP-like thermal
 * ellipsoids with optional equatorial principal-plane discs. It has no
 * dedicated UXP property dialog (anisou used the generic property dialog), so
 * the inspector page is composed from two registry sections:
 *   - the shared `BallStickRendererSection` for the inherited ball-and-stick
 *     base controls (detail / bondw / sphr / ring / thickness / ringcolor);
 *   - this `AnIsoUDiscSection` for the anisou-only disc controls.
 *
 * Disc controls map to the C++ properties consumed in `drawSphere`:
 *   - drawdisc  : bool, default true  -- gates the disc draw (`if (m_fDrawDisc)`)
 *   - discscale : real, default 1.1   -- radial scale of the discs
 *   - discthick : real, default 0.1   -- disc thickness (scaled ellipsoid units)
 *
 * `discscale` / `discthick` only affect rendering while `drawdisc` is on, so
 * they are disabled when the toggle is off (mirroring the ball-and-stick ring
 * gating). The internal `maxverts` GLU vertex cap is not a display-appearance
 * control and stays in the Generic tab rather than this curated page.
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and the corresponding row renders
 * nothing when it is absent (mirroring the UXP `findPropData` null checks). The
 * numeric controls are drag-numeric fields that commit on drag end / Enter (no
 * realtime preview).
 */

import React from "react";
import { NumRow, BoolRow } from "./RendererCommonSection";
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';
import type { RendererPropSectionProps } from "./rendererPropSections";

/**
 * "Anisotropic displacement" section: the ORTEP disc controls. The two numeric
 * rows are disabled while `drawdisc` is off, since the C++ renderer only draws
 * the discs when the toggle is on.
 */
export const AnIsoUDiscSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const drawdisc = get("drawdisc");
  const discscale = get("discscale");
  const discthick = get("discthick");

  // Disc scale / thickness only matter while the disc display is on.
  const discOff = drawdisc ? !drawdisc.value : true;

  return (
    <>
      {drawdisc && (
        <BoolRow entry={drawdisc} label="Draw disc" onSet={onSet} onReset={onReset} />
      )}
      {discscale && (
        <NumRow
          entry={discscale}
          label="Disc scale"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={3}
          step={0.05}
          fineSnap={0.01}
          coarseSnap={0.5}
          decimals={2}
          disabled={discOff}
        />
      )}
      {discthick && (
        <NumRow
          entry={discthick}
          label="Disc thickness"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={3}
          step={0.05}
          fineSnap={0.01}
          coarseSnap={0.5}
          decimals={2}
          disabled={discOff}
        />
      )}
    </>
  );
};
