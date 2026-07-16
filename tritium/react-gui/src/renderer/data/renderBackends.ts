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
import type { RenderBackendId, RenderGroupDef } from "./renderSettings";

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
  { key: "supersample",   label: "Supersampling",      type: "integer", value: 3,    group: "Quality", min: 1, max: 8,    step: 1 },
  // --- Ambient Occlusion (off by default via the aoEnabled switch, like
  //     Shadows/GI; the backend maps aoEnabled=false to aoSamples 0) ---
  { key: "aoEnabled",     label: "Enable AO",          type: "boolean", value: false, group: "Ambient Occlusion" },
  { key: "aoSamples",     label: "AO samples",         type: "integer", value: 8,    group: "Ambient Occlusion", min: 1, max: 64,  step: 1 },
  // C++ ctor default is 1e20 (unbounded); a finite default keeps the drag field
  // usable once AO is enabled (the backend falls back to 1e20 if absent).
  { key: "aoDistance",    label: "AO distance",        type: "real",    value: 100,  group: "Ambient Occlusion", min: 1, max: 1000, step: 10 },
  { key: "aoIntensity",   label: "AO intensity",       type: "real",    value: 1.0,  group: "Ambient Occlusion", min: 0, max: 1,    step: 0.1 },
  // --- Shadows ---
  { key: "shadows",       label: "Cast shadows",       type: "boolean", value: false, group: "Shadows" },
  { key: "shadowSamples", label: "Shadow samples",     type: "integer", value: 1,    group: "Shadows", min: 1, max: 64, step: 1 },
  { key: "lightRadius",   label: "Light radius (deg)", type: "real",    value: 0.0,  group: "Shadows", min: 0, max: 30, step: 0.5 },
  // --- Edges (creaseLimit -1 = disabled/auto sentinel) ---
  { key: "creaseLimit",   label: "Crease limit",       type: "real",    value: -1.0, group: "Edges", min: -1, max: 180, step: 1 },
  { key: "edgeRise",      label: "Edge rise",          type: "real",    value: 0.5,  group: "Edges", min: 0, max: 5, step: 0.1 },
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
      { key: "Quality", defaultExpanded: false },
      { key: "Ambient Occlusion", defaultExpanded: false },
      { key: "Shadows", defaultExpanded: false },
      { key: "Edges", defaultExpanded: false },
      { key: "Global Illumination", defaultExpanded: false },
    ],
    props: UMBREON_PROPS,
    // Common props the umbreon backend does not read (POV-Ray-only): stereo is
    // unsupported, blendpng post-blend is POV-Ray's layer compositing, umbreon
    // renders in-process (no CPU-thread knob), and pixel labels are POV-only.
    unsupportedCommonKeys: [
      "stereoMode",
      "stereoDepth",
      "numThreads",
      "postBlend",
      "pixelLabels",
    ],
  },
};

/** Default backend selected when the render-settings editor first opens. */
export const DEFAULT_RENDER_BACKEND: RenderBackendId = "povray";

/** Ordered list of registered backend ids (drives the backend selector). */
export const RENDER_BACKEND_IDS = Object.keys(RENDER_BACKENDS) as RenderBackendId[];
