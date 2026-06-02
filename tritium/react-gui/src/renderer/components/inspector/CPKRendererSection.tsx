/**
 * @file components/inspector/CPKRendererSection.tsx
 * @description Type-specific property section for the CPK molecular renderer
 * (C++ `CPKRenderer`, `type_name === "cpk"`).
 *
 * Migrated from the UXP `cpk-propdlg` "Atom radii" tab (`propeditor-radii-common`),
 * which stacked its controls above the shared `renderer-common-page`. In the
 * tritium inspector this becomes its own accordion entry below the common page
 * (registered in `rendererPropSections.tsx`). The numeric controls use
 * drag-numeric fields in realtime mode -- the value previews live on the
 * renderer while dragging and commits a single undo step on release.
 *
 * UXP parity (range / step / decimals):
 *   - vdwr_C / N / O / S / P / H / X : real, min 0, max 3, step 0.01,
 *     unit "A", decimalplaces 2 (per-element van der Waals radii)
 *   - detail                        : int,  min 2, max 20, step 1 (integer display)
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and the corresponding row renders
 * nothing when it is absent (mirroring the UXP `findPropData` null checks).
 * CPK has no boolean / colour controls and no enable interlock, so this section
 * is a flat list of drag-numeric rows.
 */

import React from "react";
import { NumRow } from "./RendererCommonSection";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

/** Per-element van der Waals radius rows, in the UXP "Atom radii" tab order. */
const RADII_ROWS: { key: string; label: string }[] = [
  { key: "vdwr_C", label: "Carbon" },
  { key: "vdwr_N", label: "Nitrogen" },
  { key: "vdwr_O", label: "Oxygen" },
  { key: "vdwr_S", label: "Sulfur" },
  { key: "vdwr_P", label: "Phosphorus" },
  { key: "vdwr_H", label: "Hydrogen" },
  { key: "vdwr_X", label: "Others" },
];

export const CPKRendererSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const detail = get("detail");

  return (
    <>
      {RADII_ROWS.map(({ key, label }) => {
        const e = get(key);
        return e ? (
          <NumRow
            key={key}
            entry={e}
            label={label}
            onSet={onSet}
            onReset={onReset}
            min={0}
            max={3}
            step={0.01}
            decimals={2}
            unit="Å"
            realtime
          />
        ) : null;
      })}
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
    </>
  );
};
