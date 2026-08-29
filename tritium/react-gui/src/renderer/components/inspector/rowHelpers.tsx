/**
 * @file components/inspector/rowHelpers.tsx
 * @description Shared row primitives and literal tables for the spline-family
 * renderer property sections (cartoon / ribbon / tube / nucl).
 *
 * These collapse the true duplication that was copy-pasted across the section
 * files:
 *   - `writeMany`: write one value to one or more nested-object targets in a
 *     single undo step (single target -> `onSet`, multiple -> `onSetMany`).
 *   - `MultiNumRow` / `MultiEnumRow` / `MultiMappedEnumRow` / `MultiNumInputRow`:
 *     multi-target write rows built on `writeMany`. The first target drives the
 *     displayed value, modified bar and reset; every target is written.
 *   - `PctRow`: a derived-percentage drag row with an explicit `toDisplay` /
 *     `toStored` transform (the percentage primitive only -- any axis-rewrite
 *     math stays at the callsite via `toStored`).
 *   - The section-type / junction-type / sharpness literal tables shared by the
 *     cartoon / ribbon / tube sections.
 *
 * The rows render exactly what they are told: all disabled-gating derived from
 * sibling property values stays at the section callsite.
 */

import React, { useState } from "react";
import { PropertyField, DragNumericField, SelectField, NumericField } from "../../h3-kit/form";
import { resetProps } from "./rows";
import { useRealtimeDragProp } from "@renderer/hooks/react/useRealtimeDragProp";
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';
import type { RendererPropSectionProps, PropMultiWrite } from "./rendererPropSections";

type SetFn = RendererPropSectionProps["onSet"];
type SetManyFn = RendererPropSectionProps["onSetMany"];
type ResetFn = RendererPropSectionProps["onReset"];

// --- Shared literal tables ----------------------------------------------------

/** Cross-section type labels (cartoon / ribbon / tube TubeSection `type`). */
export const SECTION_TYPE_LABELS: Record<string, string> = {
  elliptical: "Elliptical",
  roundsquare: "Round square",
  rectangle: "Rectangle",
  fancy1: "Fancy",
};
/** Section types offered when the UXP dialog omits "fancy1". */
export const SECTION_TYPES_NO_FANCY = ["elliptical", "roundsquare", "rectangle"];
/** Section types whose corners expose a meaningful sharpness (UXP gate). */
export const SHARP_TYPES = new Set(["roundsquare", "fancy1"]);
/** JctTable head/tail type labels (UXP "Round" / "Flat" / "Arrow"). */
export const JCT_TYPE_LABELS: Record<string, string> = {
  smooth: "Round",
  flat: "Flat",
  arrow: "Arrow",
};
export const JCT_TYPE_OPTIONS = ["smooth", "flat", "arrow"];

// --- Multi-target write primitive ---------------------------------------------

/**
 * Write one value to every target entry in a single undo step.
 *
 * @param targets - The nested-object entries to write (1 or more).
 * @param value - The value to write to every target.
 * @param onSet - Single-property write (used when there is exactly one target).
 * @param onSetMany - Multi-property write (used for two or more targets).
 * @remarks A single target routes through `onSet` (not `onSetMany`) so the
 * common one-property case keeps its existing wire shape byte-for-byte.
 */
export function writeMany(
  targets: GenericPropEntry[],
  value: string | number | boolean,
  onSet: SetFn,
  onSetMany: SetManyFn,
) {
  if (targets.length === 1) {
    onSet(targets[0].key, targets[0].type, value);
    return;
  }
  const writes: PropMultiWrite[] = targets.map((t) => ({
    key: t.key,
    valueType: t.type,
    value,
  }));
  onSetMany?.(writes);
}

// --- Multi-target rows --------------------------------------------------------

interface MultiEnumRowProps {
  label: string;
  targets: GenericPropEntry[];
  labels: Record<string, string>;
  options?: string[];
  onSet: SetFn;
  onSetMany: SetManyFn;
  onReset: ResetFn;
  disabled?: boolean;
}

/**
 * Friendly-label enum dropdown writing the same value to one or more nested
 * objects. The first target drives the displayed value, modified bar and reset.
 */
export const MultiEnumRow: React.FC<MultiEnumRowProps> = ({
  label,
  targets,
  labels,
  options,
  onSet,
  onSetMany,
  onReset,
  disabled,
}) => {
  const primary = targets[0];
  const shown = options ?? primary.enumdef ?? [String(primary.value)];
  return (
    <PropertyField label={label} {...resetProps(primary, onReset)}>
      <SelectField
        value={String(primary.value)}
        disabled={disabled || primary.readonly}
        onChange={(v) => writeMany(targets, v, onSet, onSetMany)}
      >
        {shown.map((opt) => (
          <option key={opt} value={opt}>
            {labels[opt] ?? opt}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};

interface MultiNumRowProps {
  label: string;
  targets: GenericPropEntry[];
  min: number;
  max: number;
  step: number;
  decimals?: number;
  unit?: string;
  /** Convert stored value -> displayed value (default identity). */
  toDisplay?: (stored: number) => number;
  /** Convert displayed value -> stored value (default identity). */
  toStored?: (display: number) => number;
  onSet: SetFn;
  onSetMany: SetManyFn;
  onReset: ResetFn;
  disabled?: boolean;
}

/**
 * Drag-numeric row writing one or more nested objects, with an optional
 * display<->stored transform (e.g. the arrow height / width percentages). Any
 * derived math is supplied via `toDisplay` / `toStored` at the callsite.
 */
export const MultiNumRow: React.FC<MultiNumRowProps> = ({
  label,
  targets,
  min,
  max,
  step,
  decimals,
  unit,
  toDisplay = (s) => s,
  toStored = (d) => d,
  onSet,
  onSetMany,
  onReset,
  disabled,
}) => {
  const primary = targets[0];
  const dragProps = useRealtimeDragProp({
    committed: toDisplay(Number(primary.value)),
    committedIsDefault: primary.isdefault,
    realtime: false,
    onPreview: () => {},
    onCommit: (original, v) => {
      if (v === original) return;
      writeMany(targets, toStored(v), onSet, onSetMany);
    },
  });
  return (
    <PropertyField label={label} {...resetProps(primary, onReset)}>
      <DragNumericField
        {...dragProps}
        min={min}
        max={max}
        step={step}
        decimals={decimals}
        unit={unit}
        disabled={disabled || primary.readonly}
      />
    </PropertyField>
  );
};

interface MultiNumInputRowProps {
  label: string;
  targets: GenericPropEntry[];
  min: number;
  max: number;
  step: number;
  onSet: SetFn;
  onSetMany: SetManyFn;
  onReset: ResetFn;
}

/**
 * Plain stepper (`NumericField`, slider hidden) writing the same integer to one
 * or more targets (e.g. the ribbon "Section detail" writing all three sections).
 * The local draft tracks the value and resyncs when the committed value changes
 * (the callsite passes a value-keyed `key` to remount).
 */
export const MultiNumInputRow: React.FC<MultiNumInputRowProps> = ({
  label,
  targets,
  min,
  max,
  step,
  onSet,
  onSetMany,
  onReset,
}) => {
  const primary = targets[0];
  const [draft, setDraft] = useState(Number(primary.value));
  const commit = (v: number) => {
    if (v !== Number(primary.value)) writeMany(targets, v, onSet, onSetMany);
  };
  return (
    <PropertyField label={label} inline {...resetProps(primary, onReset)}>
      <NumericField
        value={draft}
        onChange={setDraft}
        onRelease={commit}
        slider={false}
        min={min}
        max={max}
        step={step}
        disabled={primary.readonly}
      />
    </PropertyField>
  );
};

// --- Derived-percentage row ---------------------------------------------------

interface PctRowProps {
  label: string;
  entry: GenericPropEntry;
  min: number;
  max: number;
  step: number;
  /** Convert stored value -> shown percentage. */
  toDisplay: (stored: number) => number;
  /** Convert shown percentage -> stored value. */
  toStored: (display: number) => number;
  onSet: SetFn;
  onReset: ResetFn;
  disabled?: boolean;
}

/**
 * Drag-numeric row showing a percentage derived from a single stored value
 * (e.g. a JctTable `basw` / `arrow` arrow size). The percentage <-> stored
 * transform is supplied via `toDisplay` / `toStored`; any axis-rewrite math
 * stays at the callsite inside those callbacks.
 *
 * @remarks This row always commits (no sibling-divisor guard). Rows whose
 * transform is undefined for an out-of-range sibling value (e.g. the nucl
 * `base_thick`, which must short-circuit when `base_size <= 0`) keep their own
 * callsite-local drag row rather than using this primitive.
 */
export const PctRow: React.FC<PctRowProps> = ({
  label,
  entry,
  min,
  max,
  step,
  toDisplay,
  toStored,
  onSet,
  onReset,
  disabled,
}) => {
  const dragProps = useRealtimeDragProp({
    committed: toDisplay(Number(entry.value)),
    committedIsDefault: entry.isdefault,
    realtime: false,
    onPreview: () => {},
    onCommit: (original, v) => {
      if (v === original) return;
      onSet(entry.key, entry.type, toStored(v));
    },
  });
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <DragNumericField
        {...dragProps}
        min={min}
        max={max}
        step={step}
        decimals={0}
        unit="%"
        disabled={disabled || entry.readonly}
      />
    </PropertyField>
  );
};
