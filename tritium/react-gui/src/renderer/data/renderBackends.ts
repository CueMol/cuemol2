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

/** All registered rendering backends, keyed by id. */
export const RENDER_BACKENDS: Record<RenderBackendId, RenderBackendDescriptor> = {
  povray: {
    id: "povray",
    label: "POV-Ray",
    groups: [{ key: "POV-Ray", defaultExpanded: false }],
    props: POVRAY_PROPS,
  },
};

/** Default backend selected when the render-settings editor first opens. */
export const DEFAULT_RENDER_BACKEND: RenderBackendId = "povray";

/** Ordered list of registered backend ids (drives the backend selector). */
export const RENDER_BACKEND_IDS = Object.keys(RENDER_BACKENDS) as RenderBackendId[];
