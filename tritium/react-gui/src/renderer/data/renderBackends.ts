/**
 * @file data/renderBackends.ts
 * @description Registry of rendering backends.
 *
 * Each backend contributes its own accordion groups and property
 * definitions to the Inspector `renderSettings` editor. Adding a backend is
 * a matter of appending a `RenderBackendDescriptor` here (and, later, a
 * matching worker-side executor) -- the Inspector UI is backend-agnostic.
 */

import type { PropDef } from "./rendererProperties";
import type {
  RenderBackendId,
  RenderGroupDef,
  RenderQualityConfig,
} from "./renderSettings";

/** Static description of a rendering backend used to drive the editor UI. */
export interface RenderBackendDescriptor {
  /** Stable backend identifier. */
  id: RenderBackendId;
  /** Human-readable name shown in the backend selector. */
  label: string;
  /** Backend-specific accordion groups, rendered after the common groups. */
  groups: RenderGroupDef[];
  /** Backend-specific property definitions (mock defaults for now). */
  props: PropDef[];
  /**
   * Common (backend-independent) prop keys this backend does NOT support. They
   * are hidden from the editor while this backend is active so the settings only
   * show what the backend actually honors (POV-Ray honors every common prop).
   */
  unsupportedCommonKeys?: string[];
  /**
   * Composite quality presets (Lighting method + a named level). Omit for a
   * backend whose settings are not organised as quality axes -- the editor
   * then shows only the accordion groups.
   */
  quality?: RenderQualityConfig;
}

/** POV-Ray backend-specific options (UXP `render-pov-dlg` "POV-Ray" tab). */
const POVRAY_PROPS: PropDef[] = [
  { key: "radiosityMode", label: "Radiosity mode", type: "enum", value: "Disable", group: "POV-Ray",
    options: ["Disable", "Default", "Debug", "Fast", "Normal", "2-Bounce", "Final",
              "Outdoor LQ", "Outdoor HQ", "Outdoor Light", "Indoor LQ", "Indoor HQ"] },
  { key: "shadow",          label: "Enable shadow",       type: "boolean", value: false, group: "POV-Ray" },
  { key: "lightDefault",    label: "Use default lighting", type: "boolean", value: true,  group: "POV-Ray" },
  { key: "lightSpread",     label: "Light spread",        type: "integer", value: 1,   group: "POV-Ray", min: 1, max: 10, step: 1 },
  { key: "lightIntensity",  label: "Light intensity",     type: "real",    value: 1.3, group: "POV-Ray", min: 0, max: 2, step: 0.1 },
  { key: "flashFraction",   label: "Flash fraction",      type: "real",    value: 0.6, group: "POV-Ray", min: 0, max: 1, step: 0.1 },
  { key: "ambientFraction", label: "Ambient fraction",    type: "real",    value: 0.0, group: "POV-Ray", min: 0, max: 1, step: 0.1 },
];

/**
 * Umbreon (in-process ray tracer) backend-specific options. These are the
 * UmbreonSceneExporter qif props NOT already covered by the common props;
 * `perspective` / `useClipZ` / `showEdgeLines` / `transparentBackground` are
 * driven from the common projection / clipPlane / edgeLines / transparentBg,
 * exactly as POV-Ray does (see UmbreonBackend). Keys must not collide with the
 * common keys.
 */
const UMBREON_PROPS: PropDef[] = [
  // --- Quality (merges with the common Quality group in the editor) ---
  // Supersampling is the whole of this group, hence the "Antialiasing" heading.
  // umbreon's adaptive AA (aaMode / aaDepth) is deliberately not offered: it is
  // unsupported alongside GI, so the same setting would mean different things
  // per lighting method. Renders therefore always use the full grid (the C++
  // ctor default); the qif properties stay available for scripting.
  // 3 = the "aa" axis' default step, which every fresh backend selection
  // applies anyway; declared to match so the three places that state a
  // supersampling default (here, the axis, UmbreonBackend's fallback) agree.
  { key: "supersample",   label: "Supersampling",      type: "integer", value: 3,    group: "Antialiasing", min: 1, max: 8,    step: 1, slider: true },
  // --- Ambient Occlusion (off by default via the aoEnabled switch, like
  //     Shadows/GI; the backend maps aoEnabled=false to aoSamples 0) ---
  { key: "aoEnabled",     label: "Enable AO",          type: "boolean", value: false, group: "Ambient Occlusion" },
  { key: "aoSamples",     label: "AO samples",         type: "integer", value: 64,   group: "Ambient Occlusion", min: 1, max: 256, step: 8 },
  // 0 = auto: libcuemol2 derives the radius from the scene bounding box, so AO
  // strength does not depend on how large the molecule is. A positive value
  // overrides it with a fixed world radius.
  { key: "aoDistance",    label: "AO distance (0 = auto)", type: "real", value: 0,   group: "Ambient Occlusion", min: 0, max: 1000, step: 10 },
  { key: "aoIntensity",   label: "AO intensity",       type: "real",    value: 1.0,  group: "Ambient Occlusion", min: 0, max: 1,    step: 0.1 },
  // AO quality recipe (umbreon quality_presets.md section 2a). aoDiffuseFactor
  // defaults to the recipe value 1.0, NOT umbreon's 0.0: with CueMol's default
  // lighting most energy is direct, and AO at 0 darkens only the ambient term,
  // so it would be all but invisible.
  { key: "aoDiffuseFactor", label: "AO on direct light", type: "real",  value: 1.0,  group: "Ambient Occlusion", min: 0, max: 1, step: 0.1 },
  { key: "aoMultiScale",  label: "Multi-scale AO",     type: "boolean", value: true, group: "Ambient Occlusion" },
  { key: "aoBentNormal",  label: "Bent normal",        type: "boolean", value: true, group: "Ambient Occlusion" },
  { key: "aoLowDiscrepancy", label: "Low-discrepancy sampling", type: "boolean", value: true, group: "Ambient Occlusion" },
  // Gather resolution: "Per output pixel" is the coarse-grid fast path (needs
  // supersampling > 1), "Per shading hit" the exact inline gather. Mapped to
  // aoResDiv -1 / 0 by the AO_GATHER table in UmbreonBackend.
  { key: "aoGather",      label: "AO gather",          type: "enum",    value: "Per output pixel", group: "Ambient Occlusion",
    options: ["Per output pixel", "Per shading hit"] },
  // --- Shadows ---
  { key: "shadows",       label: "Cast shadows",       type: "boolean", value: false, group: "Shadows" },
  { key: "shadowSamples", label: "Shadow samples",     type: "integer", value: 1,    group: "Shadows", min: 1, max: 64, step: 1 },
  { key: "lightRadius",   label: "Light radius (deg)", type: "real",    value: 0.0,  group: "Shadows", min: 0, max: 30, step: 0.5 },
  // --- Edges (creaseLimit -1 = disabled/auto sentinel) ---
  { key: "creaseLimit",   label: "Crease limit",       type: "real",    value: -1.0, group: "Edges", min: -1, max: 180, step: 1 },
  { key: "edgeRise",      label: "Edge rise",          type: "real",    value: 0.5,  group: "Edges", min: 0, max: 5, step: 0.1 },
  // Contact contours BETWEEN renderers: the intersection circle where one
  // renderer's geometry plunges into another's surface (a stick entering a
  // ribbon). It is surface contact, not occlusion, so neither umbreon nor the
  // GL view inks it -- which leaves a silhouette-mode renderer's outer contour
  // open wherever it meets another renderer. Off by default to match that look.
  { key: "contactEdges",  label: "Contact edges",      type: "boolean", value: false, group: "Edges" },
  // --- Global Illumination (pt1 path-traced integrator; off by default) ---
  { key: "useGI",         label: "Enable GI",          type: "boolean", value: false, group: "Global Illumination" },
  { key: "giSamples",     label: "GI samples",         type: "integer", value: 32,   group: "Global Illumination", min: 1, max: 256, step: 1 },
  { key: "giIntensity",   label: "GI intensity",       type: "real",    value: 1.0,  group: "Global Illumination", min: 0, max: 3, step: 0.1 },
  { key: "giEnvIntensity", label: "GI environment",    type: "real",    value: 1.0,  group: "Global Illumination", min: 0, max: 3, step: 0.1 },
  // GI denoise method: a single control that composes the two umbreon knobs
  // (pt1Denoise = OIDN on the pre-composite indirect buffer; denoiser =
  // full-frame post-pass). OIDN -> pt1Denoise on; A-trous -> full-frame a-trous;
  // None -> both off. See the DENOISE_MODE map in UmbreonBackend.
  { key: "denoise",       label: "Denoise",            type: "enum",    value: "OIDN", group: "Global Illumination",
    options: ["OIDN", "A-trous", "None"] },
];

/**
 * Umbreon's quality axes, ported from the umbreon repository's
 * `docs/quality_presets.md` (section 1 for antialiasing, 2a for AO, 2b for GI,
 * 3 for shadows).
 *
 * Three rules from that guide shape the table:
 * - The axes are independent, so each is its own dropdown: image quality and
 *   shadows have nothing to do with which depth cue is active.
 * - AO and GI are alternatives, so they are one selector, not two switches,
 *   and each brings its own quality axis with the guide's own step names.
 * - A step moves quality only. Look-changing knobs (GI bounces / intensity,
 *   AO distance / intensity, edge style) are NOT in any patch: if a step
 *   changed those, "High" would mean a different picture, not a better one.
 */
const UMBREON_QUALITY: RenderQualityConfig = {
  lightings: [
    { id: "none", label: "Raytrace only", enable: { aoEnabled: false, useGI: false } },
    {
      id: "ao",
      label: "Ambient Occlusion",
      enable: { aoEnabled: true, useGI: false },
      group: "Ambient Occlusion",
    },
    {
      id: "gi",
      label: "Global Illumination",
      enable: { aoEnabled: false, useGI: true },
      group: "Global Illumination",
    },
  ],
  // GI is the guide's recommended depth cue: its built-in denoiser reaches a
  // clean image at a fraction of AO's samples (its measurements put GI high at
  // ~2 s against AO high at ~48 s).
  defaultLighting: "gi",
  lightingKeys: ["aoEnabled", "useGI"],
  axes: [
    // Axis A. Plain grid supersampling: the image is rendered at ss times the
    // output size and box-averaged down, so the cost goes as ss^2. Edge lines
    // (on by default) resolve at this factor too, which is why 3x is the step
    // to reach for when strokes look jagged.
    {
      key: "aa",
      label: "Supersampling",
      defaultStep: "high",
      steps: [
        { id: "low", label: "1x (off)", patch: { supersample: 1 } },
        { id: "medium", label: "2x", patch: { supersample: 2 } },
        { id: "high", label: "3x", patch: { supersample: 3 } },
        { id: "ultra", label: "4x", patch: { supersample: 4 } },
      ],
    },
    // Axis B-AO. The recipe flags come on at Medium; High trades the coarse
    // grid for the exact per-hit gather, which is where AO gets expensive.
    {
      key: "ao",
      label: "AO quality",
      defaultStep: "medium",
      lightings: ["ao"],
      steps: [
        {
          id: "low",
          label: "Low",
          patch: {
            aoSamples: 16, aoGather: "Per output pixel", aoLowDiscrepancy: true,
            aoMultiScale: false, aoBentNormal: false, aoDiffuseFactor: 1.0,
          },
        },
        {
          id: "medium",
          label: "Medium",
          patch: {
            aoSamples: 64, aoGather: "Per output pixel", aoLowDiscrepancy: true,
            aoMultiScale: true, aoBentNormal: true, aoDiffuseFactor: 1.0,
          },
        },
        {
          id: "high",
          label: "High",
          patch: {
            aoSamples: 256, aoGather: "Per shading hit", aoLowDiscrepancy: true,
            aoMultiScale: true, aoBentNormal: true, aoDiffuseFactor: 1.0,
          },
        },
      ],
    },
    // Axis B-GI: samples per pixel only. The denoiser stays on at every step
    // (it is what keeps a low sample count usable); Reference is the guide's
    // converged step, meant for a final still rather than iteration.
    {
      key: "gi",
      label: "GI quality",
      defaultStep: "medium",
      lightings: ["gi"],
      steps: [
        { id: "low", label: "Low", patch: { giSamples: 8, denoise: "OIDN" } },
        { id: "medium", label: "Medium", patch: { giSamples: 32, denoise: "OIDN" } },
        { id: "high", label: "High", patch: { giSamples: 64, denoise: "OIDN" } },
        { id: "reference", label: "Reference", patch: { giSamples: 256, denoise: "OIDN" } },
      ],
    },
    // Axis C. Shadows fall on meshes only and are independent of the depth
    // cue; the guide notes molecular scenes rarely need them, hence Off.
    {
      key: "shadows",
      label: "Shadows",
      defaultStep: "off",
      steps: [
        { id: "off", label: "Off", patch: { shadows: false, shadowSamples: 1, lightRadius: 0 } },
        { id: "hard", label: "Hard", patch: { shadows: true, shadowSamples: 1, lightRadius: 0 } },
        { id: "soft", label: "Soft", patch: { shadows: true, shadowSamples: 16, lightRadius: 3 } },
        { id: "softer", label: "Very soft", patch: { shadows: true, shadowSamples: 32, lightRadius: 5 } },
      ],
    },
  ],
};

/**
 * Umbreon (NPR) backend: the same in-process ray tracer with umbreon's NPR
 * tone-hatching pass on top -- the image becomes an ink drawing whose hatch
 * marks carry the shading tone. Shares every umbreon prop except the GI
 * group: hatch ink mode discards the shaded color, so umbreon force-disables
 * GI, and offering it would be a dead control.
 */
const UMBREON_NPR_PROPS: PropDef[] = [
  // --- Hatching (the pass that defines this backend) ---
  // Styles are umbreon's looks (paper/ink model + tone recipe + layers:
  // richardson / ink-cross / manga) followed by its layer presets (marks
  // only); the C++ side resolves the name through applyHatchLook first,
  // then applyHatchPreset.
  { key: "hatchStyle",   label: "Style", type: "enum", value: "richardson", group: "Hatching",
    options: ["richardson", "ink-cross", "manga", "pen-cross", "pencil",
              "engraving", "stipple", "screentone-60", "manga-square"] },
  // The manual's four base/ink coloring patterns, applied over any style:
  // ink on paper (pen figure), colored ink on paper (colored pencil --
  // richardson's own mode), ink on a flat fill of each renderer's color
  // (comic), colored ink on that fill (print-like). "Style default" keeps
  // the style's model -- without it every mark preset is fixed black on
  // white paper. Mapped to the exporter's hatchBase/hatchInk pair by
  // HATCH_COLORING in UmbreonBackend.
  { key: "hatchColoring", label: "Coloring", type: "enum", value: "Style default", group: "Hatching",
    options: ["Style default", "Ink on paper", "Colored ink on paper",
              "Ink on color fill", "Colored ink on color fill"] },
  // Multipliers over the style's own layer values, so the relative pitches
  // of a multi-layer look survive: density divides every lattice pitch
  // (2 = twice as many lines / halftone dots), width scales the marks.
  { key: "hatchDensity",    label: "Mark density", type: "real", value: 1.0, group: "Hatching", min: 0.25, max: 4, step: 0.05, slider: true },
  { key: "hatchWidthScale", label: "Mark width",   type: "real", value: 1.0, group: "Hatching", min: 0.25, max: 4, step: 0.05, slider: true },
  // Ink/paper overrides are gated by the Custom switches: the styles carry
  // their own colors (richardson's warm paper, its per-section ink), which
  // an always-on black/white default would silently destroy. The backend
  // sends the color only while the switch is on.
  { key: "hatchCustomInk",   label: "Custom ink color",   type: "boolean", value: false, group: "Hatching" },
  { key: "hatchInkColor",    label: "Ink color",          type: "color", value: "#000000", group: "Hatching" },
  { key: "hatchCustomPaper", label: "Custom paper color", type: "boolean", value: false, group: "Hatching" },
  { key: "hatchPaperColor",  label: "Paper color",        type: "color", value: "#ffffff", group: "Hatching" },
  // Give renderers WITHOUT edge-line settings a default contour (the manual
  // pairs hatching with contour edges); renderers with their own edge lines
  // keep their configured color / width / mode either way.
  { key: "hatchDefaultEdges", label: "Default contour edges", type: "boolean", value: true, group: "Hatching" },
  ...UMBREON_PROPS.filter((p) => p.group !== "Global Illumination"),
];

/**
 * NPR quality axes: umbreon's minus everything GI. The lighting selector
 * keeps only Raytrace / AO (defaulting to plain raytracing -- the manual's
 * own art direction: AO darkening muddies the hatch tone, so it is an
 * opt-in), matching the C++ side, which skips GI whenever hatching is on.
 *
 * The enable patches reference only `aoEnabled`: this backend has no useGI
 * prop, and a patch key without a matching PropDef is dropped by the settings
 * hook, which would leave `lightingOf` unable to ever match the AO option.
 */
const UMBREON_NPR_QUALITY: RenderQualityConfig = {
  lightings: [
    { id: "none", label: "Raytrace only", enable: { aoEnabled: false } },
    {
      id: "ao",
      label: "Ambient Occlusion",
      enable: { aoEnabled: true },
      group: "Ambient Occlusion",
    },
  ],
  defaultLighting: "none",
  lightingKeys: ["aoEnabled"],
  axes: UMBREON_QUALITY.axes.filter((a) => a.key !== "gi"),
};

/**
 * Common props the umbreon backends do not read (POV-Ray-only): stereo is
 * unsupported, blendpng post-blend is POV-Ray's layer compositing, umbreon
 * renders in-process (no CPU-thread knob), and pixel labels are POV-only.
 */
const UMBREON_UNSUPPORTED_COMMON_KEYS = [
  "stereoMode",
  "stereoDepth",
  "numThreads",
  "postBlend",
  "pixelLabels",
];

/** All registered rendering backends, keyed by id. */
export const RENDER_BACKENDS: Record<RenderBackendId, RenderBackendDescriptor> = {
  povray: {
    id: "povray",
    label: "POV-Ray",
    groups: [{ key: "POV-Ray", defaultExpanded: false }],
    props: POVRAY_PROPS,
  },
  umbreon: {
    id: "umbreon",
    label: "Umbreon",
    groups: [
      { key: "Antialiasing", defaultExpanded: false },
      { key: "Ambient Occlusion", defaultExpanded: false },
      { key: "Shadows", defaultExpanded: false },
      { key: "Edges", defaultExpanded: false },
      { key: "Global Illumination", defaultExpanded: false },
    ],
    props: UMBREON_PROPS,
    quality: UMBREON_QUALITY,
    unsupportedCommonKeys: UMBREON_UNSUPPORTED_COMMON_KEYS,
  },
  umbreon_npr: {
    id: "umbreon_npr",
    label: "Umbreon (NPR)",
    groups: [
      // Hatching first and expanded: the style select is what this backend
      // is about; everything below it is shared umbreon tuning.
      { key: "Hatching", defaultExpanded: true },
      { key: "Antialiasing", defaultExpanded: false },
      { key: "Ambient Occlusion", defaultExpanded: false },
      { key: "Shadows", defaultExpanded: false },
      { key: "Edges", defaultExpanded: false },
    ],
    props: UMBREON_NPR_PROPS,
    quality: UMBREON_NPR_QUALITY,
    unsupportedCommonKeys: UMBREON_UNSUPPORTED_COMMON_KEYS,
  },
};

/** Default backend selected when the render-settings editor first opens. */
export const DEFAULT_RENDER_BACKEND: RenderBackendId = "povray";

/** Ordered list of registered backend ids (drives the backend selector). */
export const RENDER_BACKEND_IDS = Object.keys(RENDER_BACKENDS) as RenderBackendId[];
