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

import React, { useMemo } from "react";
import { AccordionSection, AccordionGroup } from "./AccordionSection";
import { RendererCommonSection } from "./RendererCommonSection";
import { ObjectCommonSection } from "./ObjectCommonSection";
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
  /**
   * When the inspected node is an Object (not a renderer), show the
   * object-common page (`ObjectCommonSection`) instead of the renderer page.
   */
  isObject?: boolean;
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
  isObject,
  onSet,
  onSetMany,
  onReset,
  sceneId,
  nodeId,
}) => {
  // Scene.name is a read-only C++ property, but a scene can be renamed via
  // setName() (setGenericProp routes the write). The Properties tab presents the
  // (shared) Basic-settings Name field as editable for a Scene; the Generic tab
  // consumes the raw entries and keeps it read-only.
  const displayEntries = useMemo(
    () =>
      rendererType === "Scene"
        ? entries.map((e) => (e.key === "name" ? { ...e, readonly: false } : e))
        : entries,
    [entries, rendererType],
  );

  // Object targets get the object-common page only (UXP object-propdlg
  // "Common" tab); there are no object-type-specific sections.
  if (isObject) {
    return (
      <div className="insp-properties-tab">
        <AccordionGroup initialOpen="Basic settings">
          <ObjectCommonSection
            entries={displayEntries}
            onSet={onSet}
            onReset={onReset}
            sceneId={sceneId}
            nodeId={nodeId}
          />
        </AccordionGroup>
      </div>
    );
  }

  // Show the renderer-type-specific sections when this type has been ported
  // (e.g. `simple`). For not-yet-ported types fall back to a single collapsed
  // placeholder so the "Common + specific" layout is still visible end-to-end.
  const typeSections = getRendererPropSections(rendererType);
  const sections = typeSections.length > 0 ? typeSections : [DUMMY_SECTION];

  // All accordions in the Properties tab form one exclusive group: only one is
  // open at a time, since the per-renderer pages can be long. "Basic settings"
  // (the first common section) is open on first render -- except for the Scene,
  // whose Basic settings holds only the name, so its first real section
  // (Ambient occlusion) opens instead.
  const initialOpen =
    rendererType === "Scene" ? "Ambient occlusion" : "Basic settings";
  return (
    <div className="insp-properties-tab">
      <AccordionGroup initialOpen={initialOpen}>
        <RendererCommonSection
          entries={displayEntries}
          onSet={onSet}
          onSetMany={onSetMany}
          onReset={onReset}
          sceneId={sceneId}
          nodeId={nodeId}
        />
        {sections.map(({ key, title, defaultExpanded, Component }) => (
          <AccordionSection key={key} title={title} defaultExpanded={defaultExpanded}>
            <Component
              entries={displayEntries}
              onSet={onSet}
              onSetMany={onSetMany}
              onReset={onReset}
              sceneId={sceneId}
              nodeId={nodeId}
            />
          </AccordionSection>
        ))}
      </AccordionGroup>
    </div>
  );
};
