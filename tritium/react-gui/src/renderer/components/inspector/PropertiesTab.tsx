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
import {
  DUMMY_SECTION,
  getRendererPropSections,
  type PropMultiWrite,
} from "./rendererPropSections";
import type {
  GenericPropEntry,
  PropWriteOpts,
} from "../../worker/server/services/genericProps.service";

interface PropertiesTabProps {
  /** Live property list of the inspected node. */
  entries: GenericPropEntry[];
  /** Renderer `type_name` used to resolve type-specific sections. */
  rendererType: string;
  /** Write a property value (live-apply). `opts` carries realtime-drag info. */
  onSet: (
    key: string,
    valueType: string,
    value: string | number | boolean,
    opts?: PropWriteOpts,
  ) => void;
  /** Write several properties in one undo step (e.g. atomintr dashed toggle). */
  onSetMany?: (writes: PropMultiWrite[]) => void;
  /** Restore a property to its C++ default. */
  onReset: (key: string) => void;
  /** Active scene id (for selection / material / colour lookups). */
  sceneId: number | undefined;
  /** UID of the inspected node (for sections querying the node itself). */
  nodeId?: number;
}

export const PropertiesTab: React.FC<PropertiesTabProps> = ({
  entries,
  rendererType,
  onSet,
  onSetMany,
  onReset,
  sceneId,
  nodeId,
}) => {
  // Show the renderer-type-specific sections when this type has been ported
  // (e.g. `simple`). For not-yet-ported types fall back to a single collapsed
  // placeholder so the "Common + specific" layout is still visible end-to-end.
  const typeSections = getRendererPropSections(rendererType);
  const sections = typeSections.length > 0 ? typeSections : [DUMMY_SECTION];

  return (
    <div className="insp-properties-tab">
      <RendererCommonSection
        entries={entries}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={onReset}
        sceneId={sceneId}
        nodeId={nodeId}
      />
      {sections.map(({ key, title, defaultExpanded, Component }) => (
        <AccordionSection key={key} title={title} defaultExpanded={defaultExpanded}>
          <Component
            entries={entries}
            onSet={onSet}
            onSetMany={onSetMany}
            onReset={onReset}
            sceneId={sceneId}
            nodeId={nodeId}
          />
        </AccordionSection>
      ))}
    </div>
  );
};
