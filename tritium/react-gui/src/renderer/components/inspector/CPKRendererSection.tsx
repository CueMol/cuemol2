/**
 * @file components/inspector/CPKRendererSection.tsx
 * @description Type-specific property sections for the CPK molecular renderer
 * (C++ `CPKRenderer`, `type_name === "cpk"`).
 *
 * Migrated from the UXP `cpk-propdlg` "Atom radii" tab (`propeditor-radii-common`),
 * which stacked its controls above the shared `renderer-common-page`. The UXP
 * layout groups the seven per-element radii inside an "Atom radii" groupbox and
 * places `detail` as a separate row *outside* that group; this is mirrored here
 * by exposing two registry sections -- `CPKAtomRadiiSection` (the groupbox) and
 * `CPKDetailSection` (the loose detail row) -- rather than a single flat list.
 *
 * The numeric controls use drag-numeric fields in realtime mode -- the value
 * previews live on the renderer while dragging and commits a single undo step on
 * release.
 *
 * UXP parity (range / step / decimals):
 *   - vdwr_C / N / O / S / P / H / X : real, min 0, max 3, step 0.05
 *     (fine 0.01 / coarse 0.5), unit "A", decimalplaces 2 (per-element van der
 *     Waals radii)
 *   - detail                        : int,  min 2, max 20, step 1 (integer display)
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and the corresponding row renders
 * nothing when it is absent (mirroring the UXP `findPropData` null checks).
 */

import React from "react";
import { NumRow } from "./RendererCommonSection";
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';
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

/**
 * "Atom radii" groupbox: the seven per-element van der Waals radius rows.
 */
export const CPKAtomRadiiSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);
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
            step={0.05}
            fineSnap={0.01}
            coarseSnap={0.5}
            decimals={2}
            unit="Å"
            realtime
          />
        ) : null;
      })}
    </>
  );
};

/**
 * Loose `detail` row that sits outside the "Atom radii" group in UXP (sphere
 * mesh subdivision level).
 */
export const CPKDetailSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const detail = entries.find((e: GenericPropEntry) => e.key === "detail");
  if (!detail) return null;
  return (
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
  );
};
