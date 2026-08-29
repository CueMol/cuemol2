/**
 * @file components/inspector/DisoRendererSection.tsx
 * @description Type-specific property section for the disorder renderer
 * (C++ `DisoRenderer`, `type_name === "disorder"`). It overlays disorder
 * line / dot decorations along a sibling main-chain renderer.
 *
 * Migrated from the UXP `disorder-propdlg` "Disorder" tab into one accordion
 * section registered in `rendererPropSections.tsx`:
 *   - Target          : sibling main-chain renderer to decorate (select)
 *   - Detail          : tessellation level (stepper, inline)
 *   - Dot size        : dot width (drag-numeric)
 *   - Dot separation  : spacing between dots (drag-numeric)
 *   - Loop size       : N-term loop strength (drag-numeric)
 *   - Loop size 2     : C-term loop strength (drag-numeric)
 *   - Color           : `defaultcolor` (color editor)
 *
 * Backed by the same live getGenericProps / setGenericProp bridge as the common
 * page; each property is looked up by key and its row renders nothing when the
 * property is absent (mirroring the UXP `findPropData` null checks). The Target
 * selector additionally queries the C++ side (`getSiblingRendererNames`) to list
 * the parent molecule's tube / ribbon / cartoon / nucl renderers, matching UXP
 * `getRendNameList`.
 *
 * Per request: drag-numeric rows commit on drag end / Enter (no realtime
 * preview), and "Detail" uses the plain inline stepper, not a slider.
 */

import React, { useEffect, useState } from "react";
import {
  NumRow,
  NumInputRow,
  ColorRow,
  resetProps,
} from "./RendererCommonSection";
import { PropertyField, SelectField } from "../../h3-kit/form";
import { useCueMol } from "@renderer/hooks/cuemol/useCueMol";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

/** Sibling renderer types the disorder overlay can target (UXP parity). */
const DISO_TARGET_TYPES = ["tube", "ribbon", "cartoon", "nucl"];

interface TargetRowProps {
  entry: GenericPropEntry;
  onSet: RendererPropSectionProps["onSet"];
  onReset: RendererPropSectionProps["onReset"];
  sceneId: number | undefined;
  nodeId: number | undefined;
}

/**
 * "Target" selector: lists the parent molecule's main-chain renderer names
 * (tube / ribbon / cartoon / nucl) plus a "(none)" entry, committing the raw
 * renderer name string. Names are fetched from the worker
 * (`getSiblingRendererNames`); the current value stays selectable even when the
 * fetch is empty or excludes it.
 */
const TargetRow: React.FC<TargetRowProps> = ({
  entry,
  onSet,
  onReset,
  sceneId,
  nodeId,
}) => {
  const { cm } = useCueMol();
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!cm || sceneId === undefined || nodeId === undefined) {
      setNames([]);
      return;
    }
    let cancelled = false;
    cm.invokeService("getSiblingRendererNames", {
      sceneId,
      nodeId,
      typeNames: DISO_TARGET_TYPES,
    })
      .then((r) => {
        if (!cancelled) setNames(r.names);
      })
      .catch(() => {
        if (!cancelled) setNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cm, sceneId, nodeId]);

  const current = String(entry.value ?? "");
  return (
    <PropertyField label="Target" {...resetProps(entry, onReset)}>
      <SelectField
        value={current}
        disabled={entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        <option value="">(none)</option>
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

/**
 * "Disorder" section: target renderer, tessellation detail, dot size /
 * separation, the two loop-size strengths and the default color.
 */
export const DisoMainSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
  sceneId,
  nodeId,
}) => {
  const get = (key: string) => entries.find((e: GenericPropEntry) => e.key === key);

  const target = get("target");
  const detail = get("detail");
  const width = get("width");
  const dotsep = get("dotsep");
  const loopsize = get("loopsize");
  const loopsize2 = get("loopsize2");
  const defaultcolor = get("defaultcolor");

  return (
    <>
      {target && (
        <TargetRow
          entry={target}
          onSet={onSet}
          onReset={onReset}
          sceneId={sceneId}
          nodeId={nodeId}
        />
      )}
      {detail && (
        <NumInputRow
          key={`detail:${detail.value}`}
          entry={detail}
          label="Detail"
          onSet={onSet}
          onReset={onReset}
          min={2}
          max={20}
          step={1}
        />
      )}
      {width && (
        <NumRow
          entry={width}
          label="Dot size"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={3}
          step={0.1}
          unit="Å"
        />
      )}
      {dotsep && (
        <NumRow
          entry={dotsep}
          label="Dot separation"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={3}
          step={0.1}
          unit="Å"
        />
      )}
      {loopsize && (
        <NumRow
          entry={loopsize}
          label="Loop size"
          onSet={onSet}
          onReset={onReset}
          min={0}
          max={10}
          step={0.1}
          unit="Å"
        />
      )}
      {loopsize2 && (
        <NumRow
          entry={loopsize2}
          label="Loop size 2"
          onSet={onSet}
          onReset={onReset}
          min={-1}
          max={10}
          step={0.1}
          unit="Å"
        />
      )}
      {defaultcolor && (
        <ColorRow entry={defaultcolor} label="Color" onSet={onSet} onReset={onReset} />
      )}
    </>
  );
};
