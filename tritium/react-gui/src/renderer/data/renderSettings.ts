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
export type RenderBackendId = "povray" | "umbreon";

/**
 * What a render job produces: a single image, or the frame sequence (and
 * optionally the encoded movie) of the scene's animation.
 */
export type RenderMode = "still" | "movie";

/** Accordion group descriptor for the render-settings editor. */
export interface RenderGroupDef {
  /** Group key -- also the value of each member `PropDef.group`. */
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
  { key: "Edges", defaultExpanded: false },
];

/** A named image-size preset (UXP `render-pov-dlg` preset list). */
export interface RenderSizePreset {
  label: string;
  /** Width/height in px; `0` means "no static size" (see `dynamic`). */
  width: number;
  height: number;
  /** Output DPI applied with the preset, when defined. */
  dpi?: number;
  /** When true the size is resolved from the current view at apply time. */
  dynamic?: boolean;
}

/**
 * Image-size presets offered as a quick dropdown in the BottomPanel Render
 * tab (mirrors the UXP `render-pov-dlg` preset list). The Inspector keeps
 * the free-form width / height / dpi controls.
 */
export const RENDER_SIZE_PRESETS: RenderSizePreset[] = [
  { label: "Custom", width: 0, height: 0 },
  { label: "Current view", width: 0, height: 0, dynamic: true },
  { label: "100×100 (72dpi)", width: 100, height: 100, dpi: 72 },
  { label: "300×300 (300dpi)", width: 300, height: 300, dpi: 300 },
  { label: "600×600 (300dpi)", width: 600, height: 600, dpi: 300 },
  { label: "1200×1200 (600dpi)", width: 1200, height: 1200, dpi: 600 },
];

/** Default preset label (no enforced size). */
export const DEFAULT_RENDER_PRESET = "Custom";

// --- Image-size units ---

/** Physical / pixel unit the image size is expressed in. */
export type ImageSizeUnit = "px" | "in" | "mm" | "cm";

/**
 * Per-unit editor metadata for the width / height fields. Switching the unit
 * swaps these in so the control type and range track the unit: integers for
 * "px", fractional values for the physical units. `decimals` is the rounding
 * applied to a converted display value (UXP used 3 decimal places for every
 * non-px unit).
 *
 * `step` is tuned so a single drag spans the whole min..max range: the
 * Blender-style drag moves ~1 step per ~8px of travel, so an edge-to-edge
 * trackpad swipe covers roughly 130-150 steps. Keeping `(max - min) / step`
 * near that count (rather than a fine 1px step, which would need dozens of
 * swipes to cross the range) makes the field draggable; exact values are still
 * typed, and Shift/Ctrl give finer/coarser drag snaps.
 */
export const SIZE_UNIT_FIELD_META: Record<
  ImageSizeUnit,
  { type: "integer" | "real"; min: number; max: number; step: number; decimals: number }
> = {
  px: { type: "integer", min: 100, max: 10000, step: 100, decimals: 0 },
  in: { type: "real", min: 0.1, max: 60, step: 0.5, decimals: 3 },
  mm: { type: "real", min: 1, max: 1500, step: 10, decimals: 3 },
  cm: { type: "real", min: 0.1, max: 150, step: 1, decimals: 3 },
};

/**
 * Convert an image-size value expressed in `unit` to pixels at `dpi`.
 * Ports UXP `render-pov-dlg.js` `convImgSizeUnit` (1in = 25.4mm = 2.54cm);
 * "px" passes through unchanged.
 */
export function sizeUnitToPx(value: number, dpi: number, unit: string): number {
  switch (unit) {
    case "in":
      return value * dpi;
    case "mm":
      return (value / 25.4) * dpi;
    case "cm":
      return (value / 2.54) * dpi;
    default:
      return value; // px
  }
}

/**
 * Convert a pixel value to `unit` at `dpi`. Ports UXP `convPixToUnit`;
 * "px" is rounded to a whole pixel, physical units keep their fraction.
 */
export function pxToSizeUnit(px: number, dpi: number, unit: string): number {
  switch (unit) {
    case "in":
      return px / dpi;
    case "mm":
      return (px / dpi) * 25.4;
    case "cm":
      return (px / dpi) * 2.54;
    default:
      return Math.round(px); // px
  }
}

// --- Animation (movie) rendering ---

/**
 * Container / codec combination for the encoded movie, ported from the UXP
 * `anim-render-dlg` "Output format" list.
 */
export type MovieFormatId =
  | "mov_h264"
  | "mov_h265"
  | "mov_raw"
  | "mp4_h264"
  | "mp4_h265"
  | "wmv2"
  | "gifanim";

/** Output file extension per movie format, including the dot. */
export const MOVIE_FORMAT_EXT: Record<MovieFormatId, string> = {
  mov_h264: ".mov",
  mov_h265: ".mov",
  mov_raw: ".mov",
  mp4_h264: ".mp4",
  mp4_h265: ".mp4",
  wmv2: ".wmv",
  gifanim: ".gif",
};

/** Movie format ids in display order. */
export const MOVIE_FORMAT_IDS = Object.keys(MOVIE_FORMAT_EXT) as MovieFormatId[];

/** Human-readable format names (UXP `ffmpeg-oformat` menu labels). */
export const MOVIE_FORMAT_LABEL: Record<MovieFormatId, string> = {
  mov_h264: "QuickTime (H.264)",
  mov_h265: "QuickTime (H.265)",
  mov_raw: "QuickTime (uncompressed)",
  mp4_h264: "MP4 (H.264)",
  mp4_h265: "MP4 (H.265)",
  wmv2: "Windows Media (WMV2)",
  gifanim: "Animated GIF",
};

/**
 * Movie-mode settings.
 *
 * These are backend-independent and belong to the render *mode*, not to the
 * render settings, so they are a plain typed record rather than PropDefs and
 * get their own panel (see MovieSettingsPanel). That also lets the panel do
 * things the PropDef editor cannot: a folder-picker button, and disabling the
 * format / bit rate when encoding is off.
 *
 * The frame range is not exposed: like UXP `anim-render-dlg`, the whole
 * timeline (0 .. AnimMgr.length) is always rendered.
 */
export interface MovieSettings {
  /** Folder the frame sequence (and the movie) is written to. */
  outputDir: string;
  /** Base name of the output files (`<base>_frm_0000.png`). */
  baseName: string;
  /** Frames per second. */
  fps: number;
  /** Whether to encode the frames into a movie with ffmpeg. */
  makeMovie: boolean;
  /** Container / codec of the encoded movie. */
  movieFormat: MovieFormatId;
  /**
   * Whether to render the final frame. Dropping it makes the sequence loop
   * cleanly, since the first and last frames are otherwise identical
   * (UXP's "Loop" checkbox).
   */
  dupLastFrame: boolean;
  /** Encoding bit rate in kbps. */
  bitrateKbps: number;
}

export const DEFAULT_MOVIE_SETTINGS: MovieSettings = {
  outputDir: "",
  baseName: "movie",
  fps: 30,
  makeMovie: true,
  movieFormat: "mp4_h264",
  dupLastFrame: true,
  bitrateKbps: 1024,
};

/** Frame-rate choices offered in the Movie panel (UXP `main-mlist-fps`). */
export const MOVIE_FPS_PRESETS = [24, 30, 60];

/** Bit-rate choices in kbps (UXP `ffmpeg-bitrate`). */
export const MOVIE_BITRATE_PRESETS = [256, 1024, 10240];

/** Backend-independent render-setting definitions (mock defaults). */
export const RENDER_COMMON_PROPS: PropDef[] = [
  // --- Image (width/height carry the active unit as a field suffix; the px
  //     min/max/step mirror SIZE_UNIT_FIELD_META.px. `inline` renders them as
  //     compact single-row plain number boxes, not two-row drag fields.) ---
  { key: "width",  label: "Width",     type: "integer", value: 1200, group: "Image", min: 100, max: 10000, step: 100, unit: "px", decimals: 0, inline: true },
  { key: "height", label: "Height",    type: "integer", value: 900,  group: "Image", min: 100, max: 10000, step: 100, unit: "px", decimals: 0, inline: true },
  { key: "unit",   label: "Size unit", type: "enum",    value: "px",  group: "Image", options: ["px", "in", "mm", "cm"] },
  // Editable combobox with the UXP render-pov-dlg DPI presets (plus high-DPI
  // options); custom values allowed.
  { key: "dpi",    label: "DPI",       type: "combo",   value: 600,   group: "Image", options: ["72", "150", "300", "600", "1200", "2400"] },
  // Output settings merged into Image (no separate Output group).
  { key: "fileFormat",    label: "File format",                type: "enum",    value: "png", group: "Image", options: ["png"] },
  { key: "transparentBg", label: "Transparent background",     type: "boolean", value: false, group: "Image" },
  { key: "postBlend",     label: "Post-render alpha blending", type: "boolean", value: true,  group: "Image" },
  { key: "pixelLabels",   label: "Pixel labels",               type: "boolean", value: false, group: "Image" },

  // --- Camera ---
  { key: "projection",  label: "Projection",   type: "enum", value: "perspective", group: "Camera",
    options: ["perspective", "orthographic"] },
  { key: "stereoMode",  label: "Stereo mode",  type: "enum", value: "none", group: "Camera",
    options: ["none", "left", "right"] },
  { key: "stereoDepth", label: "Stereo depth", type: "real", value: 0.03, group: "Camera", min: 0, max: 1, step: 0.01 },
  { key: "clipPlane",   label: "Enable clip plane", type: "boolean", value: true, group: "Camera" },

  // --- Quality ---
  { key: "numThreads", label: "CPU threads", type: "integer", value: 2,    group: "Quality", min: 1, max: 32, step: 1 },

  // --- Edges (toon outline lines; backends may add crease/rise detail here) ---
  { key: "edgeLines",  label: "Edge lines",  type: "boolean", value: true, group: "Edges" },
];
