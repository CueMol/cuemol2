/**
 * @file data/rendererProperties.ts
 * @description Property descriptor types shared by the data-driven property
 * editors (currently the Render Settings editor via `PropGroupedEditor`).
 *
 * Each property carries enough metadata (type, constraints, group) for the
 * editor to render the correct widget automatically.
 */

// --- Property descriptor types ---

export type PropType = "string" | "integer" | "real" | "boolean" | "enum" | "color" | "object";

/** A single property definition consumed by the inspector. */
export interface PropDef {
  /** Internal property key (dot-notation for nested, e.g. "helix.width"). */
  key: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Data type -- determines which editor widget is rendered. */
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
  /** For numeric types: unit suffix shown inside the field (e.g. "px", "in"). */
  unit?: string;
  /** For numeric types: decimal places to display (omit to derive from step). */
  decimals?: number;
  /** For enum types: list of valid options. */
  options?: string[];
  /** Accordion group this property belongs to in the editor. */
  group: string;
}
