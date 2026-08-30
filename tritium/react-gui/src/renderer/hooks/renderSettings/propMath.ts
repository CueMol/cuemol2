/**
 * @file hooks/renderSettings/propMath.ts
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
  SIZE_UNIT_FIELD_META,
  defaultQualitySteps,
  lightingPatch,
  sizeUnitToPx,
  pxToSizeUnit,
  type RenderBackendId,
  type RenderPropPatch,
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

/**
 * A backend's declared props with its default method and default step of every
 * axis already applied, so the dropdowns describe the values from the start.
 */
export const backendPropsWithDefaults = (id: RenderBackendId): PropDef[] => {
  const cfg = qualityOf(id);
  const props = RENDER_BACKENDS[id].props;
  if (!cfg) return props;
  const steps = defaultQualitySteps(cfg);
  return applyPatch(
    props,
    lightingPatch(cfg, cfg.defaultLighting, steps, { includeShared: true }),
  );
};

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
