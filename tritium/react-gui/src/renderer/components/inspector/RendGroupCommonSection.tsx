/**
 * @file components/inspector/RendGroupCommonSection.tsx
 * @description Properties-tab page for a renderer group (`*group`).
 *
 * A RendGroup inherits the full Renderer property set in C++ (opacity,
 * material, edge lines, ...) but draws nothing itself (RendGroup::display
 * is empty), so those inherited properties have no visible effect. The
 * inspector therefore shows only the meaningful ones -- Name / Visible /
 * Locked -- instead of the renderer-common page.
 */

import React from "react";
import { AccordionSection } from "./AccordionSection";
import { TextRow, BoolRow } from "./RendererCommonSection";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

export const RendGroupCommonSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
}) => {
  const byKey = new Map<string, GenericPropEntry>();
  for (const e of entries) byKey.set(e.key, e);
  const name = byKey.get("name");
  const visible = byKey.get("visible");
  const locked = byKey.get("locked");

  return (
    <AccordionSection title="Basic settings" defaultExpanded>
      {name && (
        <TextRow
          key={`name:${name.value}`}
          entry={name}
          label="Name"
          onSet={onSet}
          onReset={onReset}
        />
      )}
      {visible && (
        <BoolRow entry={visible} label="Visible" onSet={onSet} onReset={onReset} />
      )}
      {locked && (
        <BoolRow entry={locked} label="Locked" onSet={onSet} onReset={onReset} />
      )}
    </AccordionSection>
  );
};
