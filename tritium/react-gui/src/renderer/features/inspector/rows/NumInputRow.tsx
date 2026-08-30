/**
 * @file features/inspector/rows/NumInputRow.tsx
 * @description Integer property row typed into a stepper (a subdivision count).
 */

import React, { useState } from "react";
import { PropertyField, NumericField } from "@renderer/h3-kit/form";
import { resetProps, type RowProps } from "./rowProps";

interface NumInputRowProps extends RowProps {
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
}

/**
 * Numeric row backed by the plain `NumericField` with the slider hidden
 * (`slider={false}`), i.e. a stepper input only. Used for discrete count-like
 * "detail" properties where a slider is unwanted. The stepper does not stretch
 * horizontally, so the row is laid out inline (label beside the control), like
 * the switch rows. Commits a single undo step on blur / Enter; the local draft
 * tracks the value live and resyncs when the committed value changes (caller
 * passes a value-keyed `key` to remount; the schema engine does that for the
 * kinds that hold a draft).
 */
export const NumInputRow: React.FC<NumInputRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  min,
  max,
  step,
  unit,
  disabled,
}) => {
  const [draft, setDraft] = useState(Number(entry.value));
  const commit = (v: number) => {
    if (v !== Number(entry.value)) onSet(entry.key, entry.type, v);
  };
  return (
    <PropertyField label={label} inline {...resetProps(entry, onReset)}>
      <NumericField
        value={draft}
        onChange={setDraft}
        onRelease={commit}
        slider={false}
        min={min}
        max={max}
        step={step}
        unit={unit}
        disabled={disabled || entry.readonly}
      />
    </PropertyField>
  );
};
