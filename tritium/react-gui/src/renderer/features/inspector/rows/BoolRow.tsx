/**
 * @file components/inspector/rows/BoolRow.tsx
 * @description Boolean property row, shown as a switch (Visible / Locked).
 */

import React from "react";
import { PropertyField, SwitchField } from "@renderer/h3-kit/form";
import { resetProps, type RowProps } from "./rowProps";

interface BoolRowProps extends RowProps {
  disabled?: boolean;
}

/** Boolean toggle committed immediately (e.g. Visible / Locked). */
export const BoolRow: React.FC<BoolRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  disabled,
}) => (
  <PropertyField label={label} inline {...resetProps(entry, onReset)}>
    <SwitchField
      checked={Boolean(entry.value)}
      disabled={disabled || entry.readonly}
      onChange={(c) => onSet(entry.key, entry.type, c)}
    />
  </PropertyField>
);
