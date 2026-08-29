/**
 * @file components/inspector/PropertiesTab.tsx
 * @description Structured Properties tab for the inspector panel.
 *
 * Shows the renderer-common page (`RendererCommonSection`) followed by the
 * renderer-type-specific sections resolved from `getRendererPropSections`.
 * Both are backed by the live `getGenericProps` / `setGenericProp` bridge.
 *
 * A type-specific section is either a hand-written component or a schema --
 * rows as data, rendered by `SchemaSection`. The per-type pages are being
 * moved to the schema form one type at a time, so both appear here until that
 * is done.
 *
 * A renderer type with no registry entry gets a single collapsed placeholder
 * (`DUMMY_SECTION`) after the common page, so the tab is never blank.
 */

import React, { useMemo } from "react";
import { AccordionSection, AccordionGroup } from "./AccordionSection";
import { RendererCommonSection } from "./RendererCommonSection";
import { ObjectCommonSection } from "./ObjectCommonSection";
import { RendGroupCommonSection } from "./RendGroupCommonSection";
import { SchemaSection } from "./SchemaSection";
import {
  DUMMY_SECTION,
  getRendererPropSections,
  isComponentSection,
  type PropMultiWrite,
} from "./rendererPropSections";
import type {
  GenericPropEntry,
  PropWriteOpts,
} from '@renderer/worker/shared/genericProps';

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
  /**
   * UID of the molecule the node's selection properties are evaluated against,
   * resolved worker-side by `getGenericProps`. Selection rows hand it to the
   * picker so it can report how many atoms an expression matches.
   */
  molId?: number;
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
  molId,
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
            molId={molId}
          />
        </AccordionGroup>
      </div>
    );
  }

  // Renderer groups inherit the full Renderer property set in C++ but draw
  // nothing themselves, so the renderer-common page (opacity / material /
  // edge lines) and the type-section placeholder would present dead knobs.
  // Show the dedicated minimal page instead (Name / Visible / Locked).
  if (rendererType === "*group") {
    return (
      <div className="insp-properties-tab">
        <AccordionGroup initialOpen="Basic settings">
          <RendGroupCommonSection
            entries={displayEntries}
            onSet={onSet}
            onReset={onReset}
            sceneId={sceneId}
            nodeId={nodeId}
            molId={molId}
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
          rendererType={rendererType}
          onSet={onSet}
          onSetMany={onSetMany}
          onReset={onReset}
          sceneId={sceneId}
          nodeId={nodeId}
          molId={molId}
        />
        {sections.map((section) =>
          isComponentSection(section) ? (
            <AccordionSection
              key={section.key}
              title={section.title}
              defaultExpanded={section.defaultExpanded}
            >
              <section.Component
                entries={displayEntries}
                onSet={onSet}
                onSetMany={onSetMany}
                onReset={onReset}
                sceneId={sceneId}
                nodeId={nodeId}
                molId={molId}
              />
            </AccordionSection>
          ) : (
            // A migrated page names its rows as data; the engine owns the
            // accordion too, since a section can gate itself away entirely.
            <SchemaSection
              key={section.key}
              section={section}
              entries={displayEntries}
              rendererType={rendererType}
              sceneId={sceneId}
              nodeId={nodeId}
              molId={molId}
              onSet={onSet}
              onReset={onReset}
            />
          ),
        )}
      </AccordionGroup>
    </div>
  );
};
