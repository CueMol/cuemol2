/**
 * @file components/inspector/rendererPropSections.tsx
 * @description Renderer-type -> property-section dispatch for the inspector
 * Properties tab.
 *
 * The Properties tab always shows the renderer-common page first
 * (`RendererCommonSection`), then any renderer-type-specific sections. Those
 * type-specific sections are looked up here by the renderer's `type_name`
 * (e.g. `ribbon`, `cpk`, `tube`), mirroring how each UXP renderer property
 * dialog stacks its own tabs on top of the shared `renderer-common-page`
 * overlay.
 *
 * The registry is intentionally empty for now: only the common page has been
 * migrated. As each renderer-specific page is ported, add its sections to
 * `RENDERER_SECTION_REGISTRY` keyed by `type_name`. Unknown types resolve to
 * an empty list, so they will show the common page only.
 */

import React from "react";
import type { GenericPropEntry } from "../../worker/server/services/genericProps.service";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/** Props passed to every renderer property section body. */
export interface RendererPropSectionProps {
  /** Full live property list of the inspected renderer. */
  entries: GenericPropEntry[];
  /** Write a property value (live-apply). `valueType` is the C++ type tag. */
  onSet: (key: string, valueType: string, value: string | number | boolean) => void;
  /** Restore a property to its C++ default. */
  onReset: (key: string) => void;
  /** Active scene id (for selection / material / colour lookups). */
  sceneId: number | undefined;
}

/** One accordion section in the Properties tab. */
export interface RendererPropSectionDef {
  /** Stable React key / accordion identity. */
  key: string;
  /** Accordion header title. */
  title: string;
  /** Whether the accordion starts expanded. */
  defaultExpanded?: boolean;
  /** Section body. */
  Component: React.FC<RendererPropSectionProps>;
}

// ────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────

/**
 * Renderer-type-specific sections, keyed by renderer `type_name`. Empty until
 * the per-type pages (ribbon / cpk / tube / ...) are migrated; add an entry
 * here when porting one.
 */
export const RENDERER_SECTION_REGISTRY: Record<string, RendererPropSectionDef[]> = {};

/**
 * Resolve the type-specific sections for a renderer type. Unknown types return
 * an empty list (common page only).
 */
export function getRendererPropSections(rendererType: string): RendererPropSectionDef[] {
  return RENDERER_SECTION_REGISTRY[rendererType] ?? [];
}

// ────────────────────────────────────────────────────────────
// Temporary placeholder
// ────────────────────────────────────────────────────────────

/**
 * Placeholder section appended after the common page for every renderer type
 * in this migration step, so the eventual "Common + specific" layout is
 * visible end-to-end. Remove it once `getRendererPropSections` returns real
 * sections for the known types.
 */
export const DUMMY_SECTION: RendererPropSectionDef = {
  key: "dummy",
  title: "Renderer settings",
  defaultExpanded: false,
  Component: () => (
    <div className="insp-prop-readonly">Not implemented yet.</div>
  ),
};
