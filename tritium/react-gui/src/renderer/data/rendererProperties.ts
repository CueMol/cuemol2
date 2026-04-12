/**
 * @file data/rendererProperties.ts
 * @description Sample property definitions for a Ribbon renderer.
 *
 * Each property carries enough metadata (type, constraints, group) for the
 * inspector panel to render the correct editor widget automatically.
 */

// ────────────────────────────────────────────────────────────
// Property descriptor types
// ────────────────────────────────────────────────────────────

export type PropType = "string" | "integer" | "real" | "boolean" | "enum" | "color" | "object";

/** A single property definition consumed by the inspector. */
export interface PropDef {
  /** Internal property key (dot-notation for nested, e.g. "helix.width"). */
  key: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Data type — determines which editor widget is rendered. */
  type: PropType;
  /** Current value (runtime state). */
  value: string | number | boolean;
  /** Whether the property is read-only. */
  readonly?: boolean;
  /** For numeric types: minimum allowed value. */
  min?: number;
  /** For numeric types: maximum allowed value. */
  max?: number;
  /** For numeric types: slider / spinner step size. */
  step?: number;
  /** For enum types: list of valid options. */
  options?: string[];
  /** Accordion group this property belongs to in the Properties tab. */
  group: string;
}

// ────────────────────────────────────────────────────────────
// Ribbon renderer — default properties
// ────────────────────────────────────────────────────────────

export const RIBBON_PROPERTIES: PropDef[] = [
  // ── Basic Settings ───────────────────────────────────────
  { key: "name",      label: "Name",      type: "string",  value: "ribbon1",   group: "Basic Settings" },
  { key: "selection", label: "Selection",  type: "string",  value: "protein",   group: "Basic Settings" },
  { key: "visible",   label: "Visible",   type: "boolean", value: true,        group: "Basic Settings" },
  { key: "locked",    label: "Locked",    type: "boolean", value: false,       group: "Basic Settings" },
  { key: "material",  label: "Material",  type: "enum",    value: "(none)",    group: "Basic Settings",
    options: ["(none)", "default", "matte", "glossy", "metal"] },
  { key: "opacity",   label: "Opacity",   type: "real",    value: 1.0,         group: "Basic Settings",
    min: 0, max: 1, step: 0.05 },

  // ── Common ───────────────────────────────────────────────
  { key: "section_detail", label: "Section detail", type: "integer", value: 16,    group: "Common",
    min: 2, max: 64, step: 1 },
  { key: "axialdetail",    label: "Axial detail",   type: "integer", value: 8,     group: "Common",
    min: 1, max: 32, step: 1 },
  { key: "smooth_color",   label: "Smooth color",   type: "boolean", value: true,  group: "Common" },
  { key: "end_captype",    label: "Cap type",       type: "enum",    value: "sphere", group: "Common",
    options: ["none", "sphere", "flat"] },
  { key: "egtype",         label: "Edge lines",     type: "enum",    value: "none",   group: "Common",
    options: ["none", "silhouette", "crease"] },
  { key: "eglinew",        label: "Edge width",     type: "real",    value: 0.01,  group: "Common",
    min: 0, max: 1, step: 0.01 },
  { key: "egcolor",        label: "Edge color",     type: "color",   value: "#000000", group: "Common" },

  // ── Helix Section ────────────────────────────────────────
  { key: "helix.type",   label: "Type",       type: "enum", value: "rectangle",  group: "Helix Section",
    options: ["rectangle", "elliptical", "round"] },
  { key: "helix.width",  label: "Width (Å)",  type: "real", value: 0.20,         group: "Helix Section",
    min: 0, max: 2, step: 0.01 },
  { key: "helix.tuber",  label: "Tuber",      type: "real", value: 6.0,          group: "Helix Section",
    min: 0, max: 20, step: 0.5 },
  { key: "helix.sharp",  label: "Sharpness",  type: "real", value: 0.40,         group: "Helix Section",
    min: 0, max: 1, step: 0.01 },
  { key: "helix_smooth", label: "Smoothness", type: "real", value: 0.00,         group: "Helix Section",
    min: 0, max: 1, step: 0.01 },

  // ── Helix Head ───────────────────────────────────────────
  { key: "helix_head.type",     label: "Type",           type: "enum", value: "round", group: "Helix Head",
    options: ["none", "round", "arrow", "flat"] },
  { key: "helix_head.power",    label: "Power",          type: "real", value: 2.20,    group: "Helix Head",
    min: 0, max: 10, step: 0.1 },
  { key: "helix_head.arrow_h",  label: "Arrow height %", type: "integer", value: 100, group: "Helix Head",
    min: 0, max: 200, step: 5 },
  { key: "helix_head.arrow_w",  label: "Arrow width %",  type: "integer", value: 40,  group: "Helix Head",
    min: 0, max: 200, step: 5 },

  // ── Helix Tail ───────────────────────────────────────────
  { key: "helix_tail.type",     label: "Type",           type: "enum", value: "round", group: "Helix Tail",
    options: ["none", "round", "arrow", "flat"] },
  { key: "helix_tail.power",    label: "Power",          type: "real", value: 2.20,    group: "Helix Tail",
    min: 0, max: 10, step: 0.1 },
  { key: "helix_tail.arrow_h",  label: "Arrow height %", type: "integer", value: 100, group: "Helix Tail",
    min: 0, max: 200, step: 5 },
  { key: "helix_tail.arrow_w",  label: "Arrow width %",  type: "integer", value: 40,  group: "Helix Tail",
    min: 0, max: 200, step: 5 },
];

/** All generic properties as a flat key-value table (for the Generic tab). */
export interface GenericPropEntry {
  key: string;
  readonly: boolean;
  type: string;
  value: string;
}

export const RIBBON_GENERIC_PROPERTIES: GenericPropEntry[] = [
  { key: "alpha",          readonly: false, type: "real",                   value: "1" },
  { key: "axialdetail",    readonly: false, type: "integer",               value: "8" },
  { key: "center",         readonly: true,  type: "object<Vector>",        value: "(-5.2044,1.711088,-2.1...)" },
  { key: "coil",           readonly: true,  type: "object<TubeSection>",   value: "<node>" },
  { key: "coil.detail",    readonly: false, type: "integer",               value: "16" },
  { key: "coil.sharp",     readonly: false, type: "real",                  value: "0.4" },
  { key: "coil.tuber",     readonly: false, type: "real",                  value: "1" },
  { key: "coil.type",      readonly: false, type: "enum",                  value: "elliptical" },
  { key: "coil.width",     readonly: false, type: "real",                  value: "0.35" },
  { key: "coil_smooth",    readonly: false, type: "real",                  value: "0" },
  { key: "coloring",       readonly: false, type: "object<ColoringSchem…>", value: "<node>" },
  { key: "defaultcolor",   readonly: false, type: "object<AbstractColor>", value: "$molcol" },
  { key: "egcolor",        readonly: false, type: "object<AbstractColor>", value: "#000000" },
  { key: "eglinew",        readonly: false, type: "real",                  value: "0.01" },
  { key: "egtype",         readonly: false, type: "enum",                  value: "none" },
  { key: "end_captype",    readonly: false, type: "enum",                  value: "sphere" },
  { key: "group",          readonly: false, type: "string",                value: "Default1RendPreset1" },
  { key: "has_center",     readonly: true,  type: "boolean",               value: "true" },
  { key: "helix",          readonly: true,  type: "object<TubeSection>",   value: "<node>" },
  { key: "helix.detail",   readonly: false, type: "integer",               value: "16" },
  { key: "helix.sharp",    readonly: false, type: "real",                  value: "0.4" },
  { key: "helix.tuber",    readonly: false, type: "real",                  value: "6" },
  { key: "helix.type",     readonly: false, type: "enum",                  value: "rectangle" },
  { key: "helix.width",    readonly: false, type: "real",                  value: "0.2" },
  { key: "helix_smooth",   readonly: false, type: "real",                  value: "0" },
  { key: "name",           readonly: false, type: "string",                value: "ribbon1" },
  { key: "opacity",        readonly: false, type: "real",                  value: "1.0" },
  { key: "selection",      readonly: false, type: "string",                value: "protein" },
  { key: "visible",        readonly: false, type: "boolean",               value: "true" },
];

/**
 * Ordered list of accordion groups for the Properties tab.
 * Controls rendering order and default expanded state.
 */
export const PROPERTY_GROUPS = [
  { key: "Basic Settings", defaultExpanded: true },
  { key: "Common",         defaultExpanded: false },
  { key: "Helix Section",  defaultExpanded: false },
  { key: "Helix Head",     defaultExpanded: false },
  { key: "Helix Tail",     defaultExpanded: false },
];
