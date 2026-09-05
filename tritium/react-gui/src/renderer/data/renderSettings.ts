/**
 * @file data/renderSettings.ts
 * @description Backend-independent render settings shown in the Inspector
 * `renderSettings` target (Image / Camera / Quality / Output groups).
 *
 * Values are driven through the same `PropDef` descriptor format as the
 * renderer Properties tab so the existing editor widgets (`PropEditors`) and
 * accordion grouping are reused as-is.
 */

import { DEFAULT_MOVIE_BASE_NAME } from "@shared/movieFrames";
import type { PropDef } from "./rendererProperties";

/**
 * A render-setting row as the catalogs declare it: everything the editor
 * needs to show and validate a setting, but no value. The values -- the
 * defaults included -- come from the scene's C++ RenderSettings object
 * (src/modules/rendering/RenderSettings.qif is the single source of the
 * defaults); features/render/sceneRenderSettings.ts turns a spec list plus
 * those values into the `PropDef[]` the editor works on.
 */
export type RenderPropSpec = Omit<PropDef, "value">;

/** Identifier of a rendering backend. Extended as backends are added. */
export type RenderBackendId = "povray" | "umbreon" | "umbreon_npr";

/**
 * What a render job produces: a single image, or the frame sequence (and
 * optionally the encoded movie) of the scene's animation.
 */
export type RenderMode = "still" | "movie";

// --- Quality axes ---
//
// Ported from umbreon's `docs/quality_presets.md`, which decomposes the many
// RenderOptions fields into a few INDEPENDENT axes, each with its own 3-4 step
// ladder: A (base image quality: supersample + antialiasing), B (depth cue:
// AO or GI -- mutually exclusive, since both express "concave dark, convex
// bright"), C (shadows). The axes are orthogonal, so each gets its own
// dropdown rather than being folded into one overall level.

/**
 * Depth-cue method. AO and GI are alternatives, never combined: the umbreon
 * guide models them as one selector rather than two switches.
 */
export type RenderLightingMode = "none" | "ao" | "gi";

/**
 * Step reported for an axis whose settings match none of its steps (the user
 * edited one of the props it owns by hand).
 */
export const RENDER_QUALITY_CUSTOM = "custom";

/** Prop values applied together by a quality step. */
export type RenderPropPatch = Record<string, string | number | boolean>;

/** One choice of the Lighting selector. */
export interface RenderLightingOption {
  id: RenderLightingMode;
  label: string;
  /** Props that switch this method on -- and the competing one off. */
  enable: RenderPropPatch;
  /**
   * Look defaults written when this method is picked, before its axes are
   * re-applied (so an axis step still wins). Unlike `enable` these take no
   * part in identifying the method, so the user may edit them freely.
   */
  defaults?: RenderPropPatch;
  /** Accordion group shown only while this method is selected. */
  group?: string;
}

/** One step of a quality axis' ladder. */
export interface RenderQualityStep {
  id: string;
  label: string;
  /** Props this step writes. Every step of an axis must write the same keys. */
  patch: RenderPropPatch;
}

/** An independently-settable quality axis, rendered as one dropdown. */
export interface RenderQualityAxis {
  /** Axis identifier (also the key of its selected step in the hook state). */
  key: string;
  /** Field label. */
  label: string;
  /** Steps, in display order. */
  steps: RenderQualityStep[];
  /** Step selected when the backend is picked. */
  defaultStep: string;
  /** Shown only while one of these methods is active (omit = always). */
  lightings?: RenderLightingMode[];
}

/** A backend's quality axes plus the depth-cue methods they can apply to. */
export interface RenderQualityConfig {
  /** Lighting methods offered, in display order. */
  lightings: RenderLightingOption[];
  /** Method selected when the backend is picked. */
  defaultLighting: RenderLightingMode;
  /** Independent axes, in display order. */
  axes: RenderQualityAxis[];
  /** Prop keys the Lighting selector owns (hidden from the groups). */
  lightingKeys: string[];
}

/** Step per axis key ("custom" when the values match none of its steps). */
export type RenderQualitySteps = Record<string, string>;

/**
 * Which step an axis' current values represent, or "custom" when they match
 * none of them.
 *
 * Derived from the props rather than remembered from the last pick, for the
 * same reason the lighting method is: a stored selection drifts out of sync
 * with what the settings actually say -- it went stale whenever anything wrote
 * the props without going through the dropdown (switching method, restoring a
 * render's snapshot), leaving every axis reading "Custom" over values that
 * plainly matched a step.
 */
export function stepOf(
  axis: RenderQualityAxis,
  read: (key: string) => string | number | boolean | undefined,
): string {
  for (const step of axis.steps) {
    if (Object.entries(step.patch).every(([key, value]) => read(key) === value)) {
      return step.id;
    }
  }
  return RENDER_QUALITY_CUSTOM;
}

/** `stepOf` for every axis of a backend. */
export function qualityStepsOf(
  cfg: RenderQualityConfig,
  read: (key: string) => string | number | boolean | undefined,
): RenderQualitySteps {
  const steps: RenderQualitySteps = {};
  for (const axis of cfg.axes) steps[axis.key] = stepOf(axis, read);
  return steps;
}

/** Axes that apply to `lighting`, in display order. */
export function axesFor(
  cfg: RenderQualityConfig,
  lighting: RenderLightingMode,
): RenderQualityAxis[] {
  return cfg.axes.filter((a) => !a.lightings || a.lightings.includes(lighting));
}

/** The props a step writes (empty for "custom" / an unknown step). */
export function stepPatch(axis: RenderQualityAxis, stepId: string): RenderPropPatch {
  return axis.steps.find((s) => s.id === stepId)?.patch ?? {};
}

/** Every axis at its default step. */
export function defaultQualitySteps(cfg: RenderQualityConfig): RenderQualitySteps {
  const steps: RenderQualitySteps = {};
  for (const axis of cfg.axes) steps[axis.key] = axis.defaultStep;
  return steps;
}

/**
 * Full patch for a method plus the axes that apply to it, at the given steps.
 * Used when the backend is selected and when the method changes: the axes that
 * belong to the new method are (re-)applied at their selected step, while the
 * always-on axes keep whatever they hold.
 */
export function lightingPatch(
  cfg: RenderQualityConfig,
  lighting: RenderLightingMode,
  steps: RenderQualitySteps,
  opts: { includeShared?: boolean } = {},
): RenderPropPatch {
  const patch: RenderPropPatch = {};
  const option = cfg.lightings.find((l) => l.id === lighting);
  // The method's look defaults go first so that an axis owning the same prop
  // (re-applied below at its selected step) overrides them.
  Object.assign(patch, option?.defaults ?? {});
  for (const axis of axesFor(cfg, lighting)) {
    // A method switch only re-applies that method's own axes; the shared ones
    // (image quality, shadows) are unrelated to the method and stay put.
    if (!axis.lightings && !opts.includeShared) continue;
    Object.assign(patch, stepPatch(axis, steps[axis.key] ?? axis.defaultStep));
  }
  Object.assign(patch, option?.enable ?? {});
  return patch;
}

/**
 * Which lighting method the current prop values represent. Derived rather than
 * stored, so the selector and the underlying switches can never disagree.
 */
export function lightingOf(
  cfg: RenderQualityConfig,
  read: (key: string) => string | number | boolean | undefined,
): RenderLightingMode {
  for (const option of cfg.lightings) {
    if (option.id === "none") continue;
    const on = Object.entries(option.enable).every(([k, v]) => read(k) === v);
    if (on) return option.id;
  }
  return "none";
}



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

/**
 * Movie-mode size presets: standard video resolutions (UXP `anim-render-dlg`
 * `preset-size-list`). Sizes are exact pixels, so no DPI is applied.
 */
export const MOVIE_SIZE_PRESETS: RenderSizePreset[] = [
  { label: "Custom", width: 0, height: 0 },
  { label: "QVGA (320×240)", width: 320, height: 240 },
  { label: "VGA (640×480)", width: 640, height: 480 },
  { label: "SVGA (800×600)", width: 800, height: 600 },
  { label: "XGA (1024×768)", width: 1024, height: 768 },
  { label: "HD720 (1280×720)", width: 1280, height: 720 },
  { label: "HD1080 (1920×1080)", width: 1920, height: 1080 },
];

/** Neutral preset label (no enforced size). */
export const DEFAULT_RENDER_PRESET = "Custom";

/** Still mode starts on a high-resolution square. */
export const DEFAULT_STILL_PRESET = "1200×1200 (600dpi)";

/** Movie mode starts on QVGA (a small, quick size). */
export const DEFAULT_MOVIE_PRESET = "QVGA (320×240)";

/** Size presets for a render mode: video resolutions for movies. */
export function sizePresetsForMode(mode: RenderMode): RenderSizePreset[] {
  return mode === "movie" ? MOVIE_SIZE_PRESETS : RENDER_SIZE_PRESETS;
}

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
  /**
   * Whether `outputDir` is the app-managed folder rather than one the user
   * picked. Ownership only: `outputDir` is a real path either way, so nothing
   * downstream has to resolve anything. It decides who may delete the files
   * (see main/movieOutput.ts) and whether the panel says so.
   */
  useTempDir: boolean;
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
  // Resolved to the real path on mount (useMovieOutputPrefs); empty only until
  // main answers, so a movie render needs no setup to start.
  useTempDir: true,
  outputDir: "",
  baseName: DEFAULT_MOVIE_BASE_NAME,
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

/** Backend-independent render-setting rows (values come from the scene, see RenderPropSpec). */
export const RENDER_COMMON_PROPS: RenderPropSpec[] = [
  // --- Image (width/height carry the active unit as a field suffix; the px
  //     min/max/step mirror SIZE_UNIT_FIELD_META.px. `inline` renders them as
  //     compact single-row plain number boxes, not two-row drag fields.) ---
  { key: "width",  label: "Width",     type: "integer", group: "Image", min: 100, max: 10000, step: 100, unit: "px", decimals: 0, inline: true },
  { key: "height", label: "Height",    type: "integer", group: "Image", min: 100, max: 10000, step: 100, unit: "px", decimals: 0, inline: true },
  { key: "unit",   label: "Size unit", type: "enum",  group: "Image", options: ["px", "in", "mm", "cm"] },
  // Editable combobox with the UXP render-pov-dlg DPI presets (plus high-DPI
  // options); custom values allowed.
  { key: "dpi",    label: "DPI",       type: "combo",   group: "Image", options: ["72", "150", "300", "600", "1200", "2400"] },
  { key: "transparentBg", label: "Transparent background",     type: "boolean", group: "Image" },
  { key: "postBlend",     label: "Post-render alpha blending", type: "boolean",  group: "Image" },
  { key: "pixelLabels",   label: "Pixel labels",               type: "boolean", group: "Image" },

  // --- Camera ---
  { key: "projection",  label: "Projection",   type: "enum", group: "Camera",
    options: ["perspective", "orthographic"] },
  { key: "stereoMode",  label: "Stereo mode",  type: "enum", group: "Camera",
    options: ["none", "left", "right"] },
  { key: "stereoDepth", label: "Stereo depth", type: "real", group: "Camera", min: 0, max: 1, step: 0.01 },
  { key: "clipPlane",   label: "Enable clip plane", type: "boolean", group: "Camera" },

  // --- Quality ---
  { key: "numThreads", label: "CPU threads", type: "integer",    group: "Quality", min: 1, max: 32, step: 1 },

  // --- Edges (toon outline lines; backends may add crease/rise detail here) ---
  { key: "edgeLines",  label: "Edge lines",  type: "boolean", group: "Edges" },
];
