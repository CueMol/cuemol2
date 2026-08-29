/**
 * @file components/inspector/ObjectCommonSection.tsx
 * @description Object-common property page for the inspector Properties tab.
 *
 * Migrated from the UXP `object-propdlg.xul` "Common" tab (the
 * `propeditor-object-common` overlay): Name, Selection, Visible, Locked, and a
 * read-only Linked (source) field. Backed by the same live `getGenericProps` /
 * `setGenericProp` bridge as the renderer common page -- each field is looked
 * up by property key in the live entry list and only rendered when that
 * property exists on the inspected object (Selection exists only on MolCoord;
 * Linked maps to the read-only `src` source path). Reuses the shared
 * `TextRow` / `SelRow` / `BoolRow` helpers exported by `RendererCommonSection`.
 */

import React from "react";
import { AccordionSection } from "./AccordionSection";
import { TextRow, SelRow, BoolRow } from "./RendererCommonSection";
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';
import type { RendererPropSectionProps } from "./rendererPropSections";

export const ObjectCommonSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
  onReset,
  sceneId,
}) => {
  const byKey = new Map<string, GenericPropEntry>();
  for (const e of entries) byKey.set(e.key, e);
  const get = (k: string) => byKey.get(k);

  const name = get("name");
  const sel = get("sel");
  const visible = get("visible");
  const locked = get("locked");
  // UXP "Linked" (read-only) maps to the object's read-only `src` source path.
  const src = get("src");

  const hasAny = name || sel || visible || locked || src;
  if (!hasAny) return null;

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
      {sel && (
        <SelRow
          key={`sel:${sel.value}`}
          entry={sel}
          label="Selection"
          onSet={onSet}
          onReset={onReset}
          sceneId={sceneId}
        />
      )}
      {visible && (
        <BoolRow entry={visible} label="Visible" onSet={onSet} onReset={onReset} />
      )}
      {locked && (
        <BoolRow entry={locked} label="Locked" onSet={onSet} onReset={onReset} />
      )}
      {src && (
        <TextRow
          key={`src:${src.value}`}
          entry={src}
          label="Linked"
          onSet={onSet}
          onReset={onReset}
        />
      )}
    </AccordionSection>
  );
};
