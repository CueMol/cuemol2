/**
 * @file features/inspector/rows/MappedEnumRow.tsx
 * @description Enum property row that shows friendly text per raw C++ id.
 */

import React from "react";
import { PropertyField, SelectField } from "@renderer/h3-kit/form";
import { resetProps, type RowProps } from "./rowProps";

export interface MappedEnumRowProps extends RowProps {
  /** Display text per raw enum ID (value stays the raw C++ string ID). */
  labels: Record<string, string>;
  /**
   * Offer these options, in this order. Entries not present in the property's
   * `enumdef` are dropped, so this both restricts the choices (e.g. the
   * cartoon cylinder-helix / sheet / coil section type omits "fancy1") and
   * fixes the display order (the `enumdef` from C++ getPropsJSON is
   * alphabetical, which is rarely the natural order). Defaults to the full
   * `enumdef`.
   */
  options?: string[];
  disabled?: boolean;
}

/**
 * Enum dropdown that shows a friendly label per option while committing the raw
 * C++ enum string ID. Falls back to the raw ID for any option missing from
 * `labels`. Unlike `EnumRow`, the visible option text is decoupled from the
 * committed value.
 */
export const MappedEnumRow: React.FC<MappedEnumRowProps> = ({
  entry,
  label,
  labels,
  options,
  onSet,
  onReset,
  disabled,
}) => {
  const allOptions = entry.enumdef ?? [String(entry.value)];
  // options controls the display order (enumdef is alphabetical); keep only
  // the entries the live enumdef actually offers.
  const shownOptions = options
    ? options.filter((o) => allOptions.includes(o))
    : allOptions;
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <SelectField
        value={String(entry.value)}
        disabled={disabled || entry.readonly}
        onChange={(v) => onSet(entry.key, entry.type, v)}
      >
        {shownOptions.map((opt) => (
          <option key={opt} value={opt}>
            {labels[opt] ?? opt}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};
