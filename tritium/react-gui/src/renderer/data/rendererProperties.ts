/**
 * @file data/rendererProperties.ts
 * @description Property descriptor types shared by the data-driven property
 * editors (currently the Render Settings editor via `PropGroupedEditor`).
 *
 * Each property carries enough metadata (type, constraints, group) for the
 * editor to render the correct widget automatically.
 */

// --- Property descriptor types ---

export type PropType =
  | "string"
  | "integer"
  | "real"
  | "boolean"
  | "enum"
  | "combo"
  | "color"
  | "object";

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
  /** For enum types: valid options. For combo types: preset suggestions. */
  options?: string[];
  /**
   * For enum types whose C++ property is a NUMBER: the stored value of each
   * option, by index. The editor shows the option label; the scene holds the
   * number (a crease angle dropdown over a real property, say).
   */
  enumValues?: number[];
  /** Accordion group this property belongs to in the editor. */
  group: string;
  /**
   * Render the label beside the control on a single row (default: label above).
   * For numeric props this also swaps the drag field for a plain number box --
   * used by the render-settings width/height fields.
   */
  inline?: boolean;
  /**
   * Numeric props only: render the slider + number box + stepper row
   * (`SliderField`) instead of the drag field. For settings adjusted by feel
   * within a known range (the NPR hatch multipliers).
   */
  slider?: boolean;
}
