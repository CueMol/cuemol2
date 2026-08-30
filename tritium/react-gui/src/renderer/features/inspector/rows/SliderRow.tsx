/**
 * @file components/inspector/rows/SliderRow.tsx
 * @description Numeric property row swept on a slider (a tessellation density).
 */

import React from "react";
import { PropertyField, SliderField } from "@renderer/h3-kit/form";
import { resetProps, type RowProps } from "./rowProps";

interface SliderRowProps extends RowProps {
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

/**
 * Numeric row backed by `SliderField`: label + slider + number box + stepper.
 * Use it for a bounded property whose whole range is meaningful to sweep (a
 * tessellation density, an intensity), where dragging the track is the fastest
 * way to find a value; use `NumInputRow` when only the stepper makes sense.
 *
 * `SliderField` owns the commit timing (slider release / blur / Enter /
 * stepper click) and resyncs its draft from `value`, so no value-keyed remount
 * is needed here. The visible label and the reset affordance come from
 * `PropertyField`, so the field's own label is hidden and serves only as the
 * accessible name.
 */
export const SliderRow: React.FC<SliderRowProps> = ({
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
  const committed = Number(entry.value);
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SliderField
        label={label}
        hideLabel
        value={committed}
        min={min}
        max={max}
        step={step}
        unit={unit}
        disabled={disabled || entry.readonly}
        onCommit={(v) => {
          if (v !== committed) onSet(entry.key, entry.type, v);
        }}
      />
    </PropertyField>
  );
};
