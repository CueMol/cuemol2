/**
 * @file components/inspector/SimpleRendererSection.tsx
 * @description Type-specific property section for the `simple` molecular line
 * renderer (C++ `SimpleRenderer`, `type_name === "simple"`).
 *
 * Migrated from the UXP `simple-propdlg.xul` "Simple" tab, whose only control
 * was a single "Line width" numslider stacked above the shared
 * `renderer-common-page`. In the tritium inspector this becomes its own
 * accordion entry below the common page (registered in
 * `rendererPropSections.tsx`), with the line width edited through a
 * drag-numeric field in realtime mode -- the value previews live on the
 * renderer while dragging and commits a single undo step on release.
 *
 * UXP numslider parity: min 0, max 10, increment 0.2, unit "px". Backed by the
 * same live getGenericProps / setGenericProp bridge as the common page; the
 * `width` property is looked up by key and the section renders nothing when it
 * is absent (mirroring the UXP `findPropData` null checks).
 */

import React from "react";
import { NumRow } from "./RendererCommonSection";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";
import type { RendererPropSectionProps } from "./rendererPropSections";

export const SimpleRendererSection: React.FC<RendererPropSectionProps> = ({
  entries,
  onSet,
}) => {
  const width = entries.find((e: GenericPropEntry) => e.key === "width");
  if (!width) return null;
  return (
    <NumRow
      entry={width}
      label="Line width"
      onSet={onSet}
      min={0}
      max={10}
      step={0.2}
      unit="px"
      realtime
    />
  );
};
