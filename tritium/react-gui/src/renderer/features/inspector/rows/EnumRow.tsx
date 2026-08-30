/**
 * @file components/inspector/rows/EnumRow.tsx
 * @description Enum property row whose options read as their raw C++ ids.
 */

import React from "react";
import { PropertyField, SelectField } from "@renderer/h3-kit/form";
import { resetProps, type RowProps } from "./rowProps";

export interface EnumRowProps extends RowProps {
  /**
   * Offer these options, in this order. Entries not present in the property's
   * `enumdef` are dropped. Use it to fix the display order -- the `enumdef`
   * from C++ getPropsJSON is alphabetical, which is rarely the natural order
   * (e.g. the edge type reads none -> edges -> silhouette, not the alphabetical
   * edges -> none -> silhouette). Defaults to the full `enumdef`.
   */
  options?: string[];
  disabled?: boolean;
}

/**
 * Dropdown committed immediately (e.g. Edge type). Options come from the
 * property's `enumdef` (raw C++ string IDs), optionally restricted / reordered
 * by `options`.
 */
export const EnumRow: React.FC<EnumRowProps> = ({
  entry,
  label,
  options,
  onSet,
  onReset,
  disabled,
}) => {
  const allOptions = entry.enumdef ?? [String(entry.value)];
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
            {opt}
          </option>
        ))}
      </SelectField>
    </PropertyField>
  );
};
