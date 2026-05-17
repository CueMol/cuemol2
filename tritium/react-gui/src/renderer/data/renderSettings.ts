/**
 * @file data/renderSettings.ts
 * @description Backend-independent render settings shown in the Inspector
 * `renderSettings` target (Image / Camera / Quality / Output groups).
 *
 * Phase 1 uses mock defaults; values are driven through the same `PropDef`
 * descriptor format as the renderer Properties tab so the existing editor
 * widgets (`PropEditors`) and accordion grouping can be reused as-is.
 */

import type { PropDef } from "./rendererProperties";

/** Identifier of a rendering backend. Extended as backends are added. */
export type RenderBackendId = "povray";

/** Accordion group descriptor for the render-settings editor. */
export interface RenderGroupDef {
  /** Group key — also the value of each member `PropDef.group`. */
  key: string;
  /** Whether the accordion section starts expanded. */
  defaultExpanded?: boolean;
}

/**
 * Backend-independent accordion groups, in display order.
 * Backend-specific groups are appended by the active `RenderBackendDescriptor`.
 */
export const RENDER_COMMON_GROUPS: RenderGroupDef[] = [
  { key: "Image", defaultExpanded: true },
  { key: "Camera", defaultExpanded: true },
  { key: "Quality", defaultExpanded: false },
  { key: "Output", defaultExpanded: false },
];

/** Backend-independent render-setting definitions (mock defaults). */
export const RENDER_COMMON_PROPS: PropDef[] = [
  // ── Image ────────────────────────────────────────────────
  { key: "width",  label: "Width (px)",  type: "integer", value: 1200, group: "Image", min: 1, max: 10000, step: 1 },
  { key: "height", label: "Height (px)", type: "integer", value: 900,  group: "Image", min: 1, max: 10000, step: 1 },
  { key: "unit",   label: "Size unit",   type: "enum",    value: "px",  group: "Image", options: ["px", "in", "mm", "cm"] },
  { key: "dpi",    label: "DPI",         type: "integer", value: 600,   group: "Image", min: 72, max: 1200, step: 1 },
  { key: "preset", label: "Preset",      type: "enum",    value: "Custom", group: "Image",
    options: ["Custom", "View size", "100×100 @72dpi", "300×300 @300dpi", "600×600 @300dpi", "1200×1200 @600dpi"] },
  { key: "scale",  label: "Scale",       type: "real",    value: 1.0,   group: "Image", min: 0.1, max: 4, step: 0.1 },

  // ── Camera ───────────────────────────────────────────────
  { key: "projection",  label: "Projection",   type: "enum", value: "perspective", group: "Camera",
    options: ["perspective", "orthographic"] },
  { key: "stereoMode",  label: "Stereo mode",  type: "enum", value: "none", group: "Camera",
    options: ["none", "left", "right"] },
  { key: "stereoDepth", label: "Stereo depth", type: "real", value: 0.03, group: "Camera", min: 0, max: 1, step: 0.01 },

  // ── Quality ──────────────────────────────────────────────
  { key: "numThreads",  label: "CPU threads",        type: "integer", value: 2,  group: "Quality", min: 1, max: 32, step: 1 },
  { key: "edgeLines",   label: "Edge lines",         type: "boolean", value: true, group: "Quality" },
  { key: "creaseLimit", label: "Crease limit (deg)", type: "real",    value: 50, group: "Quality", min: 0, max: 180, step: 1 },
  { key: "edgeRise",    label: "Edge rise",          type: "real",    value: 1.0, group: "Quality", min: 0, max: 10, step: 0.1 },

  // ── Output ───────────────────────────────────────────────
  { key: "fileFormat",    label: "File format",                type: "enum",    value: "png", group: "Output", options: ["png"] },
  { key: "transparentBg", label: "Transparent background",     type: "boolean", value: false, group: "Output" },
  { key: "clipPlane",     label: "Enable clip plane",          type: "boolean", value: true,  group: "Output" },
  { key: "postBlend",     label: "Post-render alpha blending", type: "boolean", value: true,  group: "Output" },
  { key: "pixelLabels",   label: "Pixel labels",               type: "boolean", value: false, group: "Output" },
];
