/**
 * @file components/inspector/PropertiesTab.tsx
 * @description Structured Properties tab for the inspector panel.
 *
 * Shows the renderer-common page (`RendererCommonSection`) followed by the
 * renderer-type-specific sections resolved from `getRendererPropSections`.
 * Both are backed by the live `getGenericProps` / `setGenericProp` bridge.
 *
 * This migration step has only the common page; per-type sections are still
 * empty, so a single collapsed placeholder (`DUMMY_SECTION`) is appended for
 * every renderer type. Once the per-type pages (ribbon / cpk / ...) are
 * ported, drop the placeholder and render `getRendererPropSections(type)`
 * directly -- unknown types then show the common page only.
 */

import React from "react";
import { AccordionSection } from "./AccordionSection";
import { RendererCommonSection } from "./RendererCommonSection";
import { DUMMY_SECTION, getRendererPropSections } from "./rendererPropSections";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";

interface PropertiesTabProps {
  /** Live property list of the inspected node. */
  entries: GenericPropEntry[];
  /** Renderer `type_name` used to resolve type-specific sections. */
  rendererType: string;
  /** Write a property value (live-apply). */
  onSet: (key: string, valueType: string, value: string | number | boolean) => void;
  /** Restore a property to its C++ default. */
  onReset: (key: string) => void;
  /** Active scene id (for selection / material / colour lookups). */
  sceneId: number | undefined;
}

export const PropertiesTab: React.FC<PropertiesTabProps> = ({
  entries,
  rendererType,
  onSet,
  onReset,
  sceneId,
}) => {
  // TEMP: append a collapsed placeholder after the common page for every
  // renderer type. Replace with `getRendererPropSections(rendererType)` once
  // per-type sections exist.
  const sections = [...getRendererPropSections(rendererType), DUMMY_SECTION];

  return (
    <div className="insp-properties-tab">
      <RendererCommonSection
        entries={entries}
        onSet={onSet}
        onReset={onReset}
        sceneId={sceneId}
      />
      {sections.map(({ key, title, defaultExpanded, Component }) => (
        <AccordionSection key={key} title={title} defaultExpanded={defaultExpanded}>
          <Component entries={entries} onSet={onSet} onReset={onReset} sceneId={sceneId} />
        </AccordionSection>
      ))}
    </div>
  );
};
