/**
 * @file features/inspector/rows/SelRow.tsx
 * @description Atom-selection property row, edited through the selection picker.
 */

import React, { useState } from "react";
import { PropertyField } from "@renderer/h3-kit/form";
import { MolSelList } from "@renderer/h3-kit/MolSelList";
import { resetProps, type RowProps } from "./rowProps";

export interface SelRowProps extends RowProps {
  sceneId: number | undefined;
  /**
   * The molecule the expression is evaluated against. Drives the picker's
   * matched-atom count and its keyword suggestions; omit when the inspected
   * node has no molecule and the count is simply not shown.
   */
  molId?: number;
  disabled?: boolean;
}

/**
 * Selection picker committed on pick / blur (compiled to a SelCommand).
 *
 * Not only for the common `sel`: the worker compiles any
 * `object<MolSelection>` property via `makeSel`, so a page with its own
 * selection (the cartoon spline anchor) uses this row too.
 */
export const SelRow: React.FC<SelRowProps> = ({
  entry,
  label,
  onSet,
  onReset,
  sceneId,
  molId,
  disabled,
}) => {
  const [draft, setDraft] = useState(String(entry.value));
  return (
    <PropertyField label={label} {...resetProps(entry, onReset)}>
      <MolSelList
        sceneID={sceneId ?? 0}
        molID={molId}
        selectedSel={draft}
        onSelectedSelChange={setDraft}
        onCommit={(v) => {
          if (v !== String(entry.value)) onSet(entry.key, entry.type, v);
        }}
        disabled={disabled || entry.readonly}
      />
    </PropertyField>
  );
};

/** Material selector; options fetched from the StyleManager via the worker. */
