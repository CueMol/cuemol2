/**
 * @file features/render/propMath.ts
 * @description The render settings' arithmetic on `PropDef` lists.
 *
 * The settings are a flat list of `{ key, value }` rows rather than a typed
 * object, because the backends declare their own. That makes every read and
 * write a search, and unit conversion a walk over the list -- worth keeping
 * where it can be read (and tested) without a hook.
 *
 * Every writer returns a new list: the rows are rendered from state, so an
 * in-place edit would not repaint.
 */

import type { PropDef } from '@renderer/data/rendererProperties';
import {
  RENDER_BACKENDS,
} from '@renderer/data/renderBackends';
import {
  DEFAULT_RENDER_PRESET,
  SIZE_UNIT_FIELD_META,
  sizePresetsForMode,
  sizeUnitToPx,
  pxToSizeUnit,
  type RenderBackendId,
  type RenderMode,
  type RenderPropPatch,
  type RenderPropSpec,
  type RenderQualityConfig,
  type RenderQualitySteps,
} from '@renderer/data/renderSettings';
import type { HatchSpec } from '@renderer/data/hatchSpec';

export interface HatchEditState {
  /** Style name the template / spec belong to ("" = none loaded). */
  style: string;
  template: HatchSpec | null;
  spec: HatchSpec | null;
}

export const INITIAL_HATCH: HatchEditState = { style: "", template: null, spec: null };

/** Deep-copy a PropDef list so edits never mutate the shared defaults. */
export const cloneProps = (props: PropDef[]): PropDef[] => props.map((p) => ({ ...p }));

/** Read a prop value by key (typed via the caller). */
export const readVal = (props: PropDef[], key: string): string | number | boolean | undefined =>
  props.find((p) => p.key === key)?.value;

/** Apply a value change to whichever list owns `key` (returns a new list). */
export const applyChange = (
  props: PropDef[],
  key: string,
  value: string | number | boolean,
): PropDef[] => {
  if (!props.some((p) => p.key === key)) return props;
  return props.map((p) => (p.key === key ? { ...p, value } : p));
};

/** Apply several values at once (used by the quality axes). */
export const applyPatch = (props: PropDef[], patch: RenderPropPatch): PropDef[] => {
  if (!props.some((p) => p.key in patch)) return props;
  return props.map((p) => (p.key in patch ? { ...p, value: patch[p.key] } : p));
};

/** A backend's quality axes, or undefined when it declares none (POV-Ray). */
export const qualityOf = (id: RenderBackendId): RenderQualityConfig | undefined =>
  RENDER_BACKENDS[id].quality;

/** Axis steps of a backend that declares none. */
export const NO_QUALITY_STEPS: RenderQualitySteps = {};

/** A backend's setting rows (no values: those come from the scene). */
export const backendSpecs = (id: RenderBackendId): RenderPropSpec[] => RENDER_BACKENDS[id].props;

/**
 * A value the editor can hold for a row before the scene's values arrive.
 * Not a default -- the defaults live in the C++ RenderSettings -- just a
 * well-typed stand-in for the frames the window spends hidden while loading.
 */
export const placeholderValue = (spec: RenderPropSpec): string | number | boolean => {
  switch (spec.type) {
    case "boolean":
      return false;
    case "integer":
    case "real":
    case "combo":
      return spec.min ?? 0;
    case "enum":
      return spec.options?.[0] ?? "";
    case "color":
      return "#000000";
    default:
      return "";
  }
};

/** Rows with placeholder values (see placeholderValue). */
export const placeholderProps = (specs: RenderPropSpec[]): PropDef[] =>
  specs.map((spec) => ({ ...spec, value: placeholderValue(spec) }));

/** Round to a number of decimal places. */
export const roundTo = (v: number, decimals: number): number => {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
};

/**
 * Set a width / height prop to `value` in `unit`, swapping in that unit's
 * editor metadata (type / range / step / decimals) and the unit suffix so the
 * control tracks the unit.
 */
export const setSizeProp = (prop: PropDef, value: number, unit: string): PropDef => {
  const m = SIZE_UNIT_FIELD_META[unit as keyof typeof SIZE_UNIT_FIELD_META] ?? SIZE_UNIT_FIELD_META.px;
  return { ...prop, value, type: m.type, min: m.min, max: m.max, step: m.step, unit, decimals: m.decimals };
};

/**
 * Reproject the width / height values into `newUnit` and switch the unit prop.
 * Each value is converted old-unit -> px -> new-unit using the current DPI,
 * mirroring UXP `render-pov-dlg.js` `onImgSzUnitSel`.
 */
export const convertSizeUnit = (props: PropDef[], newUnit: string): PropDef[] => {
  const oldUnit = String(readVal(props, "unit") ?? "px");
  if (newUnit === oldUnit) return props;
  const dpi = Number(readVal(props, "dpi") ?? 600);
  const m = SIZE_UNIT_FIELD_META[newUnit as keyof typeof SIZE_UNIT_FIELD_META] ?? SIZE_UNIT_FIELD_META.px;
  return props.map((p) => {
    if (p.key === "unit") return { ...p, value: newUnit };
    if (p.key === "width" || p.key === "height") {
      const px = sizeUnitToPx(Number(p.value), dpi, oldUnit);
      return setSizeProp(p, roundTo(pxToSizeUnit(px, dpi, newUnit), m.decimals), newUnit);
    }
    return p;
  });
};

/**
 * The size preset the width / height / DPI props currently equal, or the
 * neutral "Custom" label. Only a pixel size can match (the presets are in
 * px), and a preset that fixes the DPI must match it too; the dynamic
 * "Current view" entry never matches.
 */
export const sizePresetOf = (props: PropDef[], mode: RenderMode): string => {
  if (String(readVal(props, "unit") ?? "px") !== "px") return DEFAULT_RENDER_PRESET;
  const width = Number(readVal(props, "width"));
  const height = Number(readVal(props, "height"));
  const dpi = Number(readVal(props, "dpi"));
  const hit = sizePresetsForMode(mode).find(
    (p) =>
      !p.dynamic &&
      p.width > 0 &&
      p.width === width &&
      p.height === height &&
      (p.dpi === undefined || p.dpi === dpi),
  );
  return hit?.label ?? DEFAULT_RENDER_PRESET;
};
