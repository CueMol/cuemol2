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
 *   - Target                : `bndry_molname` (limit-display molecule name)
 *   - Selection             : `bndry_sel` (selection within the target)
 *   - Distance              : `bndry_rng` (limit radius, A)
 *
 * Parity notes (`contour-propdlg.js`):
 *   - "Center update" is a tri-state menulist over two booleans: None =
 *     (autoupdate=false, dragupdate=false), Automatic = (true, false),
 *     Automatic (drag) = (true, true). Both are written in one undo step.
 *   - "Limit display by" mirrors the UXP groupbox checkbox: its checked state is
 *     derived from a non-empty `bndry_molname`. Turning it on commits the first
 *     available molecule as the target (UXP commits the menulist's selected
 *     object); turning it off clears `bndry_molname` and `bndry_sel` together
 *     (UXP `validateWidgets` !bMapLim branch). Target / Selection / Distance are
 *     disabled while it is off (UXP `updateDisabledState`).
 *   - Target lists the scene's molecule objects (UXP `ObjMenuList` filtering by
 *     the MolCoord interface), here via `listSceneObjects` + `objectFilters`.
 *   - Coloring (`colormode` / `color` / `siglevel` / `extent` / ...) is not on
 *     the UXP Map tab and stays out (it belongs to a separate panel).
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and its row renders nothing when the
 * property is absent (mirroring the UXP `findPropData` null checks). All
 * properties are flat (no nested objects / dot-path keys).
 */

import React, { useEffect, useState } from "react";
import {
  NumRow,
  NumInputRow,
  BoolRow,
  SelRow,
  resetProps,
} from "./RendererCommonSection";
import { PropertyField, SelectField, SwitchField } from "../../h3-kit/form";
import { objectFilters } from "../../h3-kit/ObjectSelect";
import { useCueMol } from "../../hooks/useCueMol";
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
function useMolObjectNames(sceneId: number | undefined): string[] {
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
  autoEntry: GenericPropEntry;
  dragEntry: GenericPropEntry;
  onSet: SetFn;
  onSetMany: SetManyFn;
  onReset: ResetFn;
}

/**
 * Tri-state "Center update" selector over the `autoupdate` / `dragupdate`
 * booleans, written together in one undo step (or two plain writes if
 * `onSetMany` is absent). Reset restores both booleans to their defaults.
 */
const CenterUpdateRow: React.FC<CenterUpdateRowProps> = ({
  autoEntry,
  dragEntry,
  onSet,
  onSetMany,
  onReset,
}) => {
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
      <SelectField
        value={current}
        disabled={autoEntry.readonly}
        onChange={commit}
      >
        {CENTER_UPDATE_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {CENTER_UPDATE_LABELS[opt]}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};

interface LimitTargetRowProps {
  entry: GenericPropEntry;
  names: string[];
  disabled: boolean;
  onSet: SetFn;
  onReset: ResetFn;
}

/**
 * "Target" selector for the display-limit feature: lists the scene's molecule
 * objects (MolCoord interface) by name, committing the raw object-name string
 * into `bndry_molname`. The current value stays selectable even when the fetch
 * is empty or excludes it; an empty value shows a blank placeholder option (the
 * row is disabled while limiting is off).
 */
const LimitTargetRow: React.FC<LimitTargetRowProps> = ({
  entry,
  names,
  disabled,
  onSet,
  onReset,
}) => {
  const current = String(entry.value ?? "");
  return (
    <PropertyField label="Target" {...resetProps(entry, onReset)}>
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

interface LimitToggleRowProps {
  checked: boolean;
  onToggle: (on: boolean) => void;
}

/**
 * "Limit display by" enable toggle (UXP groupbox caption checkbox). Its checked
 * state is derived from a non-empty target; toggling routes through the parent's
 * on/off commit (no dedicated backing property, so no reset affordance).
 */
const LimitToggleRow: React.FC<LimitToggleRowProps> = ({ checked, onToggle }) => (
  <PropertyField label="Limit display by" inline>
    <SwitchField checked={checked} onChange={onToggle} />
  </PropertyField>
);

/**
 * "Contour" section: center update, line width, buffer size, periodic boundary,
 * and the limit-display toggle / target / selection / distance.
 */
export const ContourMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onSetMany,
  onReset,
  sceneId,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const autoupdate = get("autoupdate");
  const dragupdate = get("dragupdate");
  const width = get("width");
  const bufsize = get("bufsize");
  const usePbc = get("use_pbc");
  const bndryMol = get("bndry_molname");
  const bndrySel = get("bndry_sel");
  const bndryRng = get("bndry_rng");

  const molNames = useMolObjectNames(sceneId);

  // Limiting is on when a target molecule is set (UXP groupbox checked state).
  const limitOn = !!bndryMol && String(bndryMol.value ?? "") !== "";

  /**
   * Toggle limiting on/off, mirroring UXP `validateWidgets`: on -> commit the
   * first available molecule as the target; off -> clear target and selection
   * together in one undo step.
   */
  const toggleLimit = (on: boolean) => {
    if (on) {
      if (molNames.length > 0 && bndryMol) {
        onSet(bndryMol.key, bndryMol.type, molNames[0]);
      }
      return;
    }
    const writes: PropMultiWrite[] = [];
    if (bndryMol) writes.push({ key: bndryMol.key, valueType: bndryMol.type, value: "" });
    if (bndrySel) writes.push({ key: bndrySel.key, valueType: bndrySel.type, value: "" });
    if (writes.length === 0) return;
    if (writes.length === 1) onSet(writes[0].key, writes[0].valueType, writes[0].value);
    else if (onSetMany) onSetMany(writes);
    else writes.forEach((w) => onSet(w.key, w.valueType, w.value));
  };

  return (
    <>
      {autoupdate && dragupdate && (
        <CenterUpdateRow
          autoEntry={autoupdate}
          dragEntry={dragupdate}
          onSet={onSet}
          onSetMany={onSetMany}
          onReset={onReset}
        />
      )}
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
      {bufsize && (
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
      {usePbc && (
        <BoolRow
          entry={usePbc}
          label="Use periodic boundary"
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {bndryMol && <LimitToggleRow checked={limitOn} onToggle={toggleLimit} />}
      {bndryMol && (
        <LimitTargetRow
          entry={bndryMol}
          names={molNames}
          disabled={!limitOn}
          onSet={onSet}
          onReset={onReset}
        />
      )}
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
