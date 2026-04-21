/**
 * @file data/viewportTools.ts
 * @description Static definitions for all viewport interaction tools (modes).
 *
 * Tools are grouped by category for visual organization in the palette.
 * Each tool has a single-letter keyboard shortcut for quick activation.
 *
 * @module data/viewportTools
 */

import type { IconName } from "@blueprintjs/icons";

/** Visual grouping category used by the tool palette. */
export type ToolCategory = "navigate" | "select" | "measure" | "edit";

/** All viewport interaction modes. Extend here -- nothing else. */
export type ToolId =
  | "navigate"
  | "rectSelect"
  | "lassoSelect"
  | "distance"
  | "angle"
  | "torsion";

export interface ToolDef {
  id: ToolId;
  icon: IconName;
  label: string;
  /** Single-letter keyboard shortcut (compared case-insensitively). */
  shortcut: string;
  category: ToolCategory;
  /** CSS cursor value applied to the viewport while this tool is active. */
  cursor: string;
}

export const TOOLS: ToolDef[] = [
  { id: "navigate",    icon: "move",            label: "Navigate",    shortcut: "N", category: "navigate", cursor: "grab" },
  { id: "rectSelect",  icon: "widget",          label: "Rect Select", shortcut: "B", category: "select",   cursor: "crosshair" },
  { id: "lassoSelect", icon: "draw",            label: "Lasso",       shortcut: "L", category: "select",   cursor: "crosshair" },
  { id: "distance",    icon: "path",            label: "Distance",    shortcut: "D", category: "measure",  cursor: "crosshair" },
  { id: "angle",       icon: "geosearch",       label: "Angle",       shortcut: "A", category: "measure",  cursor: "crosshair" },
  { id: "torsion",     icon: "rotate-document", label: "Torsion",     shortcut: "T", category: "measure",  cursor: "crosshair" },
];

/** Order in which categories appear in the palette (top-to-bottom). */
export const CATEGORY_ORDER: ToolCategory[] = ["navigate", "select", "measure", "edit"];

/** O(1) lookup by ID. */
export const TOOL_BY_ID: Record<ToolId, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.id, t]),
) as Record<ToolId, ToolDef>;
