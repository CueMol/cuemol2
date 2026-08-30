/**
 * @file components/inspector/rows/TextRow.tsx
 * @description Free-text property row (a renderer's Name, a label's font).
 */

import React, { useState } from "react";
import { PropertyField, TextField } from "@renderer/h3-kit/form";
import { resetProps, type RowProps } from "./rowProps";

interface TextRowProps extends RowProps {
  disabled?: boolean;
  /**
   * Placeholder shown when the field is empty. Use "(default)" for properties
   * whose empty value falls back to a per-polymer / per-type default resolved
   * by the C++ side (e.g. the pivot atom name).
   */
  placeholder?: string;
}

/** Text input committed on blur / Enter (e.g. Name). */
export const TextRow: React.FC<TextRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  disabled,
  placeholder,
}) => {
  const [draft, setDraft] = useState(String(entry.value));
  const commit = () => {
    if (draft !== String(entry.value)) onSet(entry.key, entry.type, draft);
  };
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <TextField
        value={draft}
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        placeholder={placeholder}
        readOnly={entry.readonly}
        disabled={disabled}
      />
    </PropertyField>
  );
};
