/**
 * @file components/inspector/MapRendererCommon.tsx
 * @description Shared curated property rows for the `MapRenderer`-derived
 * renderers (contour `MapMeshRenderer` / isosurf `MapSurfRenderer` /
 * gpu_mapmesh `GLSLMapMeshRenderer2`). These renderers expose an identical
 * "Center update" mode, "Limit display by" block and cryo-EM region / level
 * of detail rows on top of their own per-type controls, so those pieces live
 * here as a single source of truth.
 *
 * Parity notes (`contour-propdlg.js` / `isosurf-propdlg.js`):
 *   - "Center update" is a tri-state menulist over two booleans: None =
 *     (autoupdate=false, dragupdate=false), Automatic = (true, false),
 *     Automatic (drag) = (true, true). Both are written in one undo step.
 *   - "Limit display by" mirrors the UXP groupbox checkbox: its checked state is
 *     derived from a non-empty `bndry_molname`. Turning it on commits the first
 *     available molecule as the target (UXP commits the menulist's selected
 *     object); turning it off clears `bndry_molname` and `bndry_sel` together
 *     (UXP `validateWidgets` !bMapLim branch). Target / Selection / Distance are
 *     disabled while it is off (UXP `updateDisabledState`). Target lists the
 *     scene's molecule objects (UXP `ObjMenuList` MolCoord-interface filter),
 *     here via `listSceneObjects` + `objectFilters`.
 */

import React, { useEffect, useState } from "react";
import { NumRow, NumInputRow, BoolRow, MappedEnumRow, SelRow, resetProps } from "./RendererCommonSection";
import { PropertyField, SelectField, SwitchField } from "../../h3-kit/form";
import { objectFilters } from "../../h3-kit/ObjectSelect";
import { useCueMol } from "@renderer/hooks/cuemol/useCueMol";
import type { SceneObjectEntry } from "../../worker/server/services/listSceneObjects.service";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps, PropMultiWrite } from "./rendererPropSections";

type SetFn = RendererPropSectionProps["onSet"];
type SetManyFn = RendererPropSectionProps["onSetMany"];
type ResetFn = RendererPropSectionProps["onReset"];

/** Center-update menulist labels (UXP `map-update`). */
const CENTER_UPDATE_LABELS: Record<string, string> = {
  none: "None",
  auto: "Automatic",
  drag: "Automatic (drag)",
};
const CENTER_UPDATE_OPTIONS = ["none", "auto", "drag"];

/**
 * Fetch the scene's molecule (MolCoord) object names for the display-limit
 * target selector, mirroring the UXP `ObjMenuList` MolCoord-interface filter.
 */
export function useMolObjectNames(sceneId: number | undefined): string[] {
  const { cm } = useCueMol();
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!cm || sceneId === undefined) {
      setNames([]);
      return;
    }
    let cancelled = false;
    cm.invokeService("listSceneObjects", { sceneId })
      .then((r) => {
        if (cancelled) return;
        const mols = (r?.objects ?? []).filter((o: SceneObjectEntry) =>
          objectFilters.molCoord(o),
        );
        setNames(mols.map((o: SceneObjectEntry) => o.name).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cm, sceneId]);

  return names;
}

interface CenterUpdateRowProps {
  entries: GenericPropEntry[];
  onSet: SetFn;
  onSetMany: SetManyFn;
  onReset: ResetFn;
}

/**
 * Tri-state "Center update" selector over the `autoupdate` / `dragupdate`
 * booleans, written together in one undo step (or two plain writes if
 * `onSetMany` is absent). Renders nothing when either property is absent. Reset
 * restores both booleans to their defaults.
 */
export const CenterUpdateRow: React.FC<CenterUpdateRowProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
}) => {
  const autoEntry = entries.find((e) => e.key === "autoupdate");
  const dragEntry = entries.find((e) => e.key === "dragupdate");
  if (!autoEntry || !dragEntry) return null;

  const auto = Boolean(autoEntry.value);
  const drag = Boolean(dragEntry.value);
  const current = !auto ? "none" : drag ? "drag" : "auto";

  const commit = (v: string) => {
    const nextAuto = v !== "none";
    const nextDrag = v === "drag";
    if (nextAuto === auto && nextDrag === drag) return;
    if (onSetMany) {
      onSetMany([
        { key: autoEntry.key, valueType: autoEntry.type, value: nextAuto },
        { key: dragEntry.key, valueType: dragEntry.type, value: nextDrag },
      ]);
    } else {
      onSet(autoEntry.key, autoEntry.type, nextAuto);
      onSet(dragEntry.key, dragEntry.type, nextDrag);
    }
  };

  // Reset both booleans (the displayed state derives from the pair).
  const resetBoth: ResetFn = () => {
    onReset(autoEntry.key);
    onReset(dragEntry.key);
  };

  return (
    <PropertyField label="Center update" {...resetProps(autoEntry, resetBoth)}>
      <SelectField value={current} disabled={autoEntry.readonly} onChange={commit}>
        {CENTER_UPDATE_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {CENTER_UPDATE_LABELS[opt]}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};

export interface MolTargetRowProps {
  entry: GenericPropEntry;
  /** Row label (e.g. "Target", "Selection mol", "Coloring mol"). */
  label: string;
  /** Scene molecule (MolCoord) object names to offer. */
  names: string[];
  disabled?: boolean;
  onSet: SetFn;
  onReset: ResetFn;
}

/**
 * Molecule-target selector shared by the MapRenderer display-limit block and
 * the reference-molecule (`target`) rows of surface-style renderers: lists the
 * scene's molecule objects (MolCoord interface) by name, committing the raw
 * object-name string into the given property. The current value stays
 * selectable even when the fetch is empty or excludes it; an empty value shows
 * a blank placeholder option.
 */
export const MolTargetRow: React.FC<MolTargetRowProps> = ({
  entry,
  label,
  names,
  disabled = false,
  onSet,
  onReset,
}) => {
  const current = String(entry.value ?? "");
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={current}
        disabled={disabled || entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        {current === "" && <option value="" />}
        {/* Keep the current value selectable even if it is not in the list. */}
        {current !== "" && !names.includes(current) && (
          <option value={current}>{current}</option>
        )}
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};

interface LimitDisplayRowsProps {
  entries: GenericPropEntry[];
  onSet: SetFn;
  onSetMany: SetManyFn;
  onReset: ResetFn;
  sceneId: number | undefined;
}

/**
 * The "Limit display by" block: enable toggle + Target + Selection + Distance.
 * Renders nothing when `bndry_molname` is absent.
 *
 * The group is "on" when a target molecule is set OR the user has switched the
 * toggle on (`enabled` local state). Decoupling the on-state from a non-empty
 * `bndry_molname` avoids a dead-lock: the only way to set the target is through
 * this block, but if no molecule is in the scene yet (or the async molecule list
 * has not loaded), `bndry_molname` stays empty and the toggle could never be
 * turned on. With the local `enabled`, turning the toggle on enables the Target
 * selector so the user can pick a molecule once it is available; if one is
 * already known it is auto-picked (UXP `validateWidgets` parity). Turning it off
 * clears target and selection together in one undo step.
 */
export const LimitDisplayRows: React.FC<LimitDisplayRowsProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
  sceneId,
}) => {
  const get = (key: string) => entries.find((e) => e.key === key);
  const bndryMol = get("bndry_molname");
  const bndrySel = get("bndry_sel");
  const bndryRng = get("bndry_rng");

  const molNames = useMolObjectNames(sceneId);
  const [enabled, setEnabled] = useState(false);

  if (!bndryMol) return null;

  const hasTarget = String(bndryMol.value ?? "") !== "";
  const limitOn = enabled || hasTarget;

  const toggleLimit = (on: boolean) => {
    setEnabled(on);
    if (on) {
      // Auto-pick the first molecule for convenience (UXP parity). If none is
      // available yet, the Target selector is now enabled so the user can pick
      // one once the molecule list loads.
      if (!hasTarget && molNames.length > 0) onSet(bndryMol.key, bndryMol.type, molNames[0]);
      return;
    }
    const writes: PropMultiWrite[] = [
      { key: bndryMol.key, valueType: bndryMol.type, value: "" },
    ];
    if (bndrySel) writes.push({ key: bndrySel.key, valueType: bndrySel.type, value: "" });
    if (writes.length === 1) onSet(writes[0].key, writes[0].valueType, writes[0].value);
    else if (onSetMany) onSetMany(writes);
    else writes.forEach((w) => onSet(w.key, w.valueType, w.value));
  };

  return (
    <>
      <PropertyField label="Limit display by" inline>
        <SwitchField checked={limitOn} onChange={toggleLimit} />
      </PropertyField>
      <MolTargetRow
        entry={bndryMol}
        label="Target"
        names={molNames}
        disabled={!limitOn}
        onSet={onSet}
        onReset={onReset}
      />
      {bndrySel && (
        <SelRow
          entry={bndrySel}
          label="Selection"
          onSet={onSet}
          onReset={onReset}
          sceneId={sceneId}
          disabled={!limitOn}
        />
      )}
      {bndryRng && (
        <NumRow
          entry={bndryRng}
          label="Distance"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={10}
          step={0.1}
          unit="Å"
          disabled={!limitOn}
        />
      )}
    </>
  );
};

// --- Region / level of detail (cryo-EM map mode) ---

/** Display labels of the `region_mode` enum (raw C++ IDs stay the values). */
export const REGION_MODE_LABELS: Record<string, string> = {
  auto: "Auto",
  box: "Box around center",
  full: "Full map",
};
const REGION_MODE_ORDER = ["auto", "box", "full"];

/** Display labels of the `lod` enum (marching / sampling stride). */
export const LOD_LABELS: Record<string, string> = {
  auto: "Auto",
  step1: "1 (full resolution)",
  step2: "2",
  step4: "4",
  step8: "8",
};
const LOD_ORDER = ["auto", "step1", "step2", "step4", "step8"];

/**
 * Effective region policy of a map renderer from its entries: the
 * read-only `region_mode_resolved` when the addon exposes it, else the raw
 * `region_mode` (an explicit full; "auto" is treated as box).
 */
export function effectiveRegionMode(entries: GenericPropEntry[]): "box" | "full" {
  const resolved = entries.find((e) => e.key === "region_mode_resolved");
  if (resolved) return String(resolved.value) === "full" ? "full" : "box";
  const raw = entries.find((e) => e.key === "region_mode");
  return raw && String(raw.value) === "full" ? "full" : "box";
}

interface RegionLodRowsProps {
  entries: GenericPropEntry[];
  onSet: RendererPropSectionProps["onSet"];
  onReset: RendererPropSectionProps["onReset"];
}

/**
 * The cryo-EM map mode rows shared by the map renderers (all three carry the
 * C++ `MapRenderer` properties): "Region" (`region_mode`), "Level of detail"
 * (`lod`), and, in the full region only, "LoD budget" (`lod_budget`) and
 * "Refine on zoom" (`zoom_refine`). Each row renders only when its property
 * exists on the renderer.
 */
export const RegionLodRows: React.FC<RegionLodRowsProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const get = (key: string) => entries.find((e) => e.key === key);
  const regionMode = get("region_mode");
  const lod = get("lod");
  const lodBudget = get("lod_budget");
  const zoomRefine = get("zoom_refine");
  const isFull = effectiveRegionMode(entries) === "full";

  return (
    <>
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
      {zoomRefine && isFull && (
        <BoolRow entry={zoomRefine} label="Refine on zoom" onSet={onSet} onReset={onReset} />
      )}
    </>
  );
};
