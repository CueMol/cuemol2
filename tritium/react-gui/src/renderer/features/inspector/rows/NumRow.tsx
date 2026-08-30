/**
 * @file features/inspector/rows/NumRow.tsx
 * @description Numeric property row dialled by dragging (the workhorse row).
 */

import React from "react";
import { PropertyField, DragNumericField } from "@renderer/h3-kit/form";
import { useRealtimeDragProp } from "@renderer/hooks/react/useRealtimeDragProp";
import { resetProps, type RowProps } from "./rowProps";

interface NumRowProps extends RowProps {
  min: number;
  max: number;
  step: number;
  /** Fine drag snap (Shift). Defaults to `step / 10`; see DragNumericField. */
  fineSnap?: number;
  /** Coarse drag snap (Ctrl / Cmd). Defaults to `step * 10`. */
  coarseSnap?: number;
  unit?: string;
  /**
   * Decimals to display. Omit to derive from the fine snap (`step / 10`); set
   * explicitly (e.g. `0`) for integer-valued properties so they do not show a
   * spurious fractional digit.
   */
  decimals?: number;
  disabled?: boolean;
  /** Live-apply the value to the renderer during the drag (one undo step). */
  realtime?: boolean;
}

/**
 * Drag-to-snap numeric field committed on drag end / Enter (e.g. Opacity,
 * Width). With `realtime`, the renderer updates live during the drag (the
 * worker previews without undo and commits a single step on release).
 */
export const NumRow: React.FC<NumRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  min,
  max,
  step,
  fineSnap,
  coarseSnap,
  unit,
  decimals,
  disabled,
  realtime,
}) => {
  const committed = Number(entry.value);
  const dragProps = useRealtimeDragProp({
    committed,
    committedIsDefault: entry.isdefault,
    realtime,
    onPreview: (v) => onSet(entry.key, entry.type, v, { mode: "preview" }),
    onCommit: (original, v, wasDefault) => {
      if (v === original) return;
      // Realtime: the renderer was previewed, so restore `original` (and its
      // default flag) before the single undo step. Non-realtime: plain commit
      // (current behavior).
      if (realtime)
        onSet(entry.key, entry.type, v, {
          mode: "commit",
          originalValue: original,
          originalWasDefault: wasDefault,
        });
      else onSet(entry.key, entry.type, v);
    },
    onAbort: (original, wasDefault) =>
      onSet(entry.key, entry.type, original, {
        mode: "abort",
        originalWasDefault: wasDefault,
      }),
  });
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <DragNumericField
        {...dragProps}
        min={min}
        max={max}
        step={step}
        fineSnap={fineSnap}
        coarseSnap={coarseSnap}
        unit={unit}
        decimals={decimals}
        disabled={disabled || entry.readonly}
      />
    </PropertyField>
  );
};
