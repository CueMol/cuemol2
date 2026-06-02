/**
 * @file components/inspector/BallStickRendererSection.tsx
 * @description Type-specific property section for the ball-and-stick molecular
 * renderer (C++ `BallStickRenderer`, `type_name === "ballstick"`).
 *
 * Migrated from the UXP `ballstick-propdlg.xul` "Ball & Stick" tab, which
 * stacked its controls above the shared `renderer-common-page`. In the tritium
 * inspector this becomes its own accordion entry below the common page
 * (registered in `rendererPropSections.tsx`). The numeric controls use
 * drag-numeric fields in realtime mode -- the value previews live on the
 * renderer while dragging and commits a single undo step on release.
 *
 * UXP parity (range / step):
 *   - detail    : int,  min 2,  max 20, step 1  (no unit, integer display)
 *   - bondw     : real, min 0,  max 3,  step 0.01, unit "A"
 *   - sphr      : real, min 0,  max 3,  step 0.01, unit "A"
 *   - ring      : bool toggle; gates the two ring controls below
 *   - thickness : real, min 0,  max 3,  step 0.01, unit "A" (disabled when ring off)
 *   - ringcolor : colour (disabled when ring off)
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and the corresponding row renders
 * nothing when it is absent (mirroring the UXP `findPropData` null checks).
 */

import React from "react";
import { NumRow, BoolRow, ColorRow } from "./RendererCommonSection";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

export const BallStickRendererSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const detail = get("detail");
  const bondw = get("bondw");
  const sphr = get("sphr");
  const ring = get("ring");
  const thickness = get("thickness");
  const ringcolor = get("ringcolor");

  // Ring thickness / colour are editable only while the ring display is on
  // (UXP `ballstick-propdlg` updateEnabledState parity).
  const ringOff = ring ? !ring.value : true;

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
          realtime
        />
      )}
      {bondw && (
        <NumRow
          entry={bondw}
          label="Bond width"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={3}
          step={0.01}
          unit="Å"
          realtime
        />
      )}
      {sphr && (
        <NumRow
          entry={sphr}
          label="Atom radius"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={3}
          step={0.01}
          unit="Å"
          realtime
        />
      )}
      {ring && <BoolRow entry={ring} label="Show ring" onSet={onSet} onReset={onReset} />}
      {thickness && (
        <NumRow
          entry={thickness}
          label="Thickness"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={3}
          step={0.01}
          unit="Å"
          disabled={ringOff}
          realtime
        />
      )}
      {ringcolor && (
        <ColorRow
          entry={ringcolor}
          label="Ring color"
          onSet={onSet}
          onReset={onReset}
          disabled={ringOff}
        />
      )}
    </>
  );
};
