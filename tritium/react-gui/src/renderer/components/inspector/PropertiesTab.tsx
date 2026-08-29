/**
 * @file components/inspector/PropertiesTab.tsx
 * @description Structured Properties tab for the inspector panel.
 *
 * A page is the common sections for the kind of node in front of us, followed
 * by the sections its renderer type adds. Both come from
 * `getRendererPropSections` / `schema/common`, and both are backed by the live
 * `getGenericProps` / `setGenericProp` bridge.
 *
 * A type-specific section is either a schema -- rows as data, rendered by
 * `SchemaSection` -- or a hand-written component. The per-type pages are being
 * moved to the schema form one type at a time, so both appear here until that
 * is done.
 *
 * A renderer type with no registry entry gets a single collapsed placeholder
 * (`DUMMY_SECTION`) after the common page, so the tab is never blank.
 */

import React, { useMemo } from "react";
import { AccordionSection, AccordionGroup } from "./AccordionSection";
import { SchemaSection } from "./SchemaSection";
import {
  OBJECT_COMMON_SECTIONS,
  REND_GROUP_COMMON_SECTIONS,
  RENDERER_COMMON_SECTIONS,
} from "./schema/common";
import {
  DUMMY_SECTION,
  getRendererPropSections,
  isComponentSection,
  type PropMultiWrite,
  type RendererPropSectionDef,
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
   * object-common page instead of the renderer one.
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

/** The sections a node gets before its type-specific ones. */
function commonSectionsFor(
  rendererType: string,
  isObject: boolean | undefined,
): RendererPropSectionDef[] {
  if (isObject) return OBJECT_COMMON_SECTIONS;
  if (rendererType === "*group") return REND_GROUP_COMMON_SECTIONS;
  return RENDERER_COMMON_SECTIONS;
}

/**
 * The type-specific sections, or none for the node kinds that have none: an
 * Object has no type page in UXP, and a renderer group's inherited renderer
 * properties are dead knobs (RendGroup::display draws nothing), so its
 * placeholder would advertise settings that do nothing.
 */
function typeSectionsFor(
  rendererType: string,
  isObject: boolean | undefined,
): RendererPropSectionDef[] {
  if (isObject || rendererType === "*group") return [];
  const sections = getRendererPropSections(rendererType);
  return sections.length > 0 ? sections : [DUMMY_SECTION];
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

  const sections = [
    ...commonSectionsFor(rendererType, isObject),
    ...typeSectionsFor(rendererType, isObject),
  ];

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
              onSetMany={onSetMany}
              onReset={onReset}
            />
          ),
        )}
      </AccordionGroup>
    </div>
  );
};
