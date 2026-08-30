/**
 * @file components/inspector/rows/ColorRow.tsx
 * @description Colour property row: a swatch that opens the picker.
 */

import React from "react";
import { PropertyField, ColorField } from "@renderer/h3-kit/form";
import { resetProps, type RowProps } from "./rowProps";

export interface ColorRowProps extends RowProps {
  disabled?: boolean;
}

/** Colour editor committed on a completed change (e.g. Edge color). */
export const ColorRow: React.FC<ColorRowProps> = ({ entry, label, onSet, onReset, disabled }) => (
  <PropertyField label={label} {...resetProps(entry, onReset)}>
    <ColorField
      value={String(entry.value)}
      onCommit={(v) => onSet(entry.key, entry.type, v)}
      disabled={disabled || entry.readonly}
    />
  </PropertyField>
);
