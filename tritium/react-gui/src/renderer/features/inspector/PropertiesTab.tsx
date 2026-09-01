/**
 * @file features/inspector/PropertiesTab.tsx
 * @description Structured Properties tab for the inspector panel.
 *
 * A page is the common sections for the kind of node in front of us, followed
 * by the sections its renderer type adds. Both come from
 * `getRendererPropSections` / `schema/common`, and both are backed by the live
 * `getGenericProps` / `setGenericProp` bridge.
 *
 * Every page is rows as data, rendered by `SchemaSection`. A renderer type
 * with no registry entry shows the common page alone: there is nothing
 * type-specific to say about it, and saying so in a placeholder only claimed
 * settings existed that did not.
 */

import React, { useMemo } from "react";
import { AccordionGroup } from "./AccordionSection";
import { SchemaSection } from "./SchemaSection";
import {
  OBJECT_COMMON_SECTIONS,
  REND_GROUP_COMMON_SECTIONS,
  RENDERER_COMMON_SECTIONS,
} from "@renderer/features/inspector/schema/common";
import {
  getRendererPropSections,
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
 * The type-specific sections, looked up by the node's type label.
 *
 * An object goes through the same registry as a renderer: the label is its C++
 * class name (`DensityMap`), which cannot collide with a renderer `type_name`
 * (those are lowercase). Most object classes have no entry and fall through to
 * the empty list, which is what UXP did for every object -- but a DensityMap's
 * map kind is a property of the data that the renderers only read, so it has a
 * page of its own. A renderer group is excluded outright: its inherited
 * renderer properties are dead knobs (RendGroup::display draws nothing).
 */
function typeSectionsFor(rendererType: string): RendererPropSectionDef[] {
  if (rendererType === "*group") return [];
  return getRendererPropSections(rendererType);
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
    ...typeSectionsFor(rendererType),
  ];

  // The Scene page is short enough (a name plus four small categories) that
  // collapsing costs more than it saves, so its sections show as headings with
  // everything visible. Every other page keeps the accordions.
  const flat = rendererType === "Scene";

  // All accordions in the Properties tab form one exclusive group: only one is
  // open at a time, since the per-renderer pages can be long. "Basic settings"
  // (the first common section) is open on first render.
  const body = sections.map((section) => (
    // The engine owns the section chrome too, since a section can gate itself
    // away entirely.
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
      flat={flat}
    />
  ));

  return (
    <div className="insp-properties-tab">
      {flat ? body : <AccordionGroup initialOpen="Basic settings">{body}</AccordionGroup>}
    </div>
  );
};
