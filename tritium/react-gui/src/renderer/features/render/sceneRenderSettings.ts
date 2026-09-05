/**
 * @file features/render/sceneRenderSettings.ts
 * @description The Rendering window's settings as the scene stores them.
 *
 * A scene keeps its render settings in a C++ `RenderSettings` object (Scene
 * app data "render"; src/modules/rendering/RenderSettings.qif): the
 * backend-independent settings as its own properties and each backend's
 * settings in a child object named by the backend id. That object -- its
 * declared defaults included -- is the single source of every value the
 * editor shows: the catalogs here (data/renderSettings.ts,
 * data/renderBackends.ts) only say which rows exist and how to show and
 * validate them. The worker hands the values over as a flat map keyed
 * `key` (common) / `<backend>.key` (a backend block), together with the
 * class defaults in the same shape; this module turns them into the
 * editor's `PropDef[]` and back.
 *
 * Loading is tolerant by default ('warn'): a value the catalog cannot
 * represent -- an option a newer or older build named differently, a number
 * out of range -- falls back to the C++ default (or, failing that, a
 * placeholder) and is reported, so a scene saved by another version still
 * opens. 'strict' turns the report into an error and exists for tests. Keys
 * the catalog does not show are left alone: the C++ class may declare more
 * than the editor offers.
 */

import type { PropDef } from "@renderer/data/rendererProperties";
import {
  RENDER_COMMON_PROPS,
  SIZE_UNIT_FIELD_META,
  pxToSizeUnit,
  type ImageSizeUnit,
  type RenderBackendId,
  type RenderPropSpec,
} from "@renderer/data/renderSettings";
import { DEFAULT_RENDER_BACKEND, RENDER_BACKEND_IDS } from "@renderer/data/renderBackends";
import type { RenderHatchSnapshot, RenderSettingsSnapshot } from "@renderer/data/renderResult";
import type { RenderSettingsValues } from "@renderer/worker/shared/renderSettingsValues";
import { backendSpecs, placeholderValue, roundTo, setSizeProp } from "./propMath";

export type { RenderSettingsValues };

/** How a value the catalog cannot represent is handled on load. */
export type ValidationMode = "warn" | "strict";

/** A scene's settings, ready for the editor. */
export interface LoadedRenderSettings {
  backend: RenderBackendId;
  /** Whether the scene names its backend (false: `backend` is the app default). */
  backendExplicit: boolean;
  commonProps: PropDef[];
  backendProps: PropDef[];
  hatch?: RenderHatchSnapshot;
  /** Every correction made while loading (empty when all values were valid). */
  warnings: string[];
}

/** The subset of a snapshot the scene stores. */
export type StoredRenderSettings = Pick<
  RenderSettingsSnapshot,
  "backend" | "commonProps" | "backendProps" | "hatch"
>;

/** The value type C++ holds per key. */
export type SceneValueType = "boolean" | "integer" | "real" | "string";

/** The two hatch spec texts, stored beside the umbreon_npr props. */
const HATCH_SPEC_KEYS = ["hatchLayersSpec", "hatchToneSpec"] as const;

/** The stored key of a backend row. */
export const blockKey = (backend: RenderBackendId, key: string): string => `${backend}.${key}`;

/** An enum row stored as a number (PropDef.enumValues): label <-> value by index. */
const isNumericEnum = (p: RenderPropSpec): boolean => p.type === "enum" && p.enumValues !== undefined;

function enumLabelOf(p: RenderPropSpec, v: number): string | undefined {
  const i = (p.enumValues ?? []).indexOf(v);
  return i >= 0 ? p.options?.[i] : undefined;
}

function enumValueOf(p: RenderPropSpec, label: string): number | undefined {
  const i = (p.options ?? []).indexOf(label);
  return i >= 0 ? p.enumValues?.[i] : undefined;
}

function catalogType(p: RenderPropSpec): SceneValueType {
  switch (p.type) {
    case "boolean":
      return "boolean";
    case "integer":
      return "integer";
    case "real":
      return "real";
    case "enum":
      return isNumericEnum(p) ? "real" : "string";
    default:
      return "string";
  }
}

/**
 * C++ type per stored key, derived from the catalogs. The image size is a
 * real whatever the unit (an integer only while the unit is px), and the DPI
 * combo holds a number.
 */
export const SCENE_VALUE_TYPES: Readonly<Record<string, SceneValueType>> = (() => {
  const types: Record<string, SceneValueType> = { backend: "string" };
  for (const p of RENDER_COMMON_PROPS) types[p.key] = catalogType(p);
  types.width = "real";
  types.height = "real";
  types.dpi = "real";
  for (const id of RENDER_BACKEND_IDS) {
    for (const p of backendSpecs(id)) types[blockKey(id, p.key)] = catalogType(p);
  }
  for (const k of HATCH_SPEC_KEYS) types[blockKey("umbreon_npr", k)] = "string";
  return types;
})();

const COLOR_RE = /^#[0-9a-f]{6}$/i;

function isBackendId(v: unknown): v is RenderBackendId {
  return typeof v === "string" && (RENDER_BACKEND_IDS as string[]).includes(v);
}

function isUnit(v: unknown): v is ImageSizeUnit {
  return typeof v === "string" && v in SIZE_UNIT_FIELD_META;
}

/**
 * Whether `v` is a value the catalog row can hold. Numbers are trusted to
 * be numbers (C++ typed them) but must be finite and, when the row declares
 * a range, inside it; option-typed rows check their options.
 */
function accepts(p: RenderPropSpec, v: unknown): boolean {
  switch (p.type) {
    case "boolean":
      return typeof v === "boolean";
    case "integer":
    case "real": {
      if (typeof v !== "number" || !Number.isFinite(v)) return false;
      if (p.min !== undefined && v < p.min) return false;
      if (p.max !== undefined && v > p.max) return false;
      return true;
    }
    case "enum":
      if (isNumericEnum(p)) return typeof v === "number" && (p.enumValues ?? []).includes(v);
      return typeof v === "string" && (p.options ?? []).includes(v);
    case "combo":
      // Presets only suggest: a typed value (450 DPI) is as valid as a preset.
      return typeof v === "number" && Number.isFinite(v) && v > 0;
    case "color":
      return typeof v === "string" && COLOR_RE.test(v);
    default:
      return typeof v === "string";
  }
}

/**
 * Rows with their values taken from `values` under `prefix`; a missing or
 * unacceptable value falls back to the C++ default, then to a placeholder,
 * and is reported in `warnings`. The size rows are rebuilt for `unit`.
 */
export function withValues(
  specs: RenderPropSpec[],
  values: RenderSettingsValues,
  defaults: RenderSettingsValues,
  opts: { prefix?: string; unit?: ImageSizeUnit; dpi?: number; warnings?: string[] } = {},
): PropDef[] {
  const prefix = opts.prefix ?? "";
  const warnings = opts.warnings ?? [];
  return specs.map((spec) => {
    const path = prefix + spec.key;
    const sized =
      opts.unit && (spec.key === "width" || spec.key === "height")
        ? setSizeProp({ ...spec, value: 0 }, 0, opts.unit)
        : undefined;
    const row: RenderPropSpec = sized ?? spec;

    const fallback = (): string | number | boolean => {
      const d = defaults[path];
      if (d !== undefined && accepts(row, d)) return d;
      if (sized && opts.unit) {
        // The placeholder size is the px minimum re-expressed in the unit.
        const meta = SIZE_UNIT_FIELD_META[opts.unit];
        return roundTo(pxToSizeUnit(SIZE_UNIT_FIELD_META.px.min, opts.dpi ?? 600, opts.unit), meta.decimals);
      }
      return placeholderValue(row);
    };

    // A numeric enum row shows its option label; the scene holds the number.
    const shown = (v: string | number | boolean): string | number | boolean =>
      isNumericEnum(row) && typeof v === "number" ? (enumLabelOf(row, v) ?? v) : v;

    const v = values[path];
    if (v === undefined) {
      const fb = fallback();
      warnings.push(`${path}: missing, using ${JSON.stringify(fb)}`);
      return { ...row, value: shown(fb) };
    }
    if (!accepts(row, v)) {
      const fb = fallback();
      warnings.push(`${path}: unacceptable value ${JSON.stringify(v)}, using ${JSON.stringify(fb)}`);
      return { ...row, value: shown(fb) };
    }
    return { ...row, value: shown(v) };
  });
}

/** The rows of one backend block, from the stored values (see withValues). */
export function backendPropsFromValues(
  values: RenderSettingsValues,
  defaults: RenderSettingsValues,
  backend: RenderBackendId,
  warnings: string[] = [],
): PropDef[] {
  return withValues(backendSpecs(backend), values, defaults, { prefix: `${backend}.`, warnings });
}

/**
 * Build the editor state from the values a scene holds.
 *
 * @param values - the flat map the worker read from the scene's object
 * @param opts.defaults - the class defaults in the same shape (the fallback)
 * @param opts.umbreonAvailable - whether this build can render with umbreon;
 *   a stored umbreon backend falls back to POV-Ray otherwise
 * @param opts.mode - 'warn' (default) reports corrections to the console;
 *   'strict' throws instead
 */
export function snapshotFromRenderSettings(
  values: RenderSettingsValues,
  opts: { defaults: RenderSettingsValues; umbreonAvailable: boolean; mode?: ValidationMode },
): LoadedRenderSettings {
  const mode = opts.mode ?? "warn";
  const warnings: string[] = [];

  // Backend: "" is "not chosen" (the app default applies), not a bad value.
  const appDefault: RenderBackendId = opts.umbreonAvailable ? "umbreon" : DEFAULT_RENDER_BACKEND;
  let backend: RenderBackendId;
  let backendExplicit = true;
  const rawBackend = values.backend;
  if (rawBackend === undefined || rawBackend === "") {
    backend = appDefault;
    backendExplicit = false;
  } else if (!isBackendId(rawBackend)) {
    warnings.push(`backend: unknown value ${JSON.stringify(rawBackend)}, using ${appDefault}`);
    backend = appDefault;
    backendExplicit = false;
  } else if (!opts.umbreonAvailable && rawBackend !== "povray") {
    warnings.push(`backend: ${rawBackend} is not available in this build, using povray`);
    backend = "povray";
  } else {
    backend = rawBackend;
  }

  // The size unit first: the width / height rows depend on it.
  const unitDefault = isUnit(opts.defaults.unit) ? opts.defaults.unit : "px";
  let unit: ImageSizeUnit;
  if (values.unit === undefined) {
    warnings.push(`unit: missing, using ${unitDefault}`);
    unit = unitDefault;
  } else if (!isUnit(values.unit)) {
    warnings.push(`unit: unknown value ${JSON.stringify(values.unit)}, using ${unitDefault}`);
    unit = unitDefault;
  } else {
    unit = values.unit;
  }
  const dpi = typeof values.dpi === "number" && values.dpi > 0 ? values.dpi : undefined;

  const commonProps = withValues(RENDER_COMMON_PROPS, { ...values, unit }, opts.defaults, {
    unit,
    dpi,
    warnings,
  });
  const backendProps = backendPropsFromValues(values, opts.defaults, backend, warnings);

  let hatch: RenderHatchSnapshot | undefined;
  if (backend === "umbreon_npr") {
    const layers = values[blockKey("umbreon_npr", "hatchLayersSpec")];
    if (typeof layers === "string" && layers.length > 0) {
      const tone = values[blockKey("umbreon_npr", "hatchToneSpec")];
      hatch = { layersSpec: layers, toneSpec: typeof tone === "string" ? tone : "" };
    }
  }

  if (warnings.length > 0) {
    if (mode === "strict") {
      throw new Error(`render settings failed validation:\n${warnings.join("\n")}`);
    }
    console.warn("render settings loaded with corrections:", warnings);
  }

  return { backend, backendExplicit, commonProps, backendProps, ...(hatch ? { hatch } : {}), warnings };
}

function coerce(type: SceneValueType, v: string | number | boolean): string | number | boolean {
  switch (type) {
    case "boolean":
      return typeof v === "boolean" ? v : v === "true" || v === 1;
    case "integer":
    case "real": {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    default:
      return String(v);
  }
}

/**
 * The flat map a scene stores for the editor state: the backend id (only
 * when the user chose it -- "" otherwise, so the app default keeps applying),
 * the common keys, the active backend's block, and for umbreon_npr the two
 * hatch spec texts ("" when the look is the style's own). Values are coerced
 * to the C++ type of the key, so the DPI combo goes out as a number whatever
 * the editor holds.
 */
export function valuesFromSnapshot(
  s: StoredRenderSettings,
  opts: { backendExplicit: boolean } = { backendExplicit: true },
): RenderSettingsValues {
  const out: RenderSettingsValues = { backend: opts.backendExplicit ? s.backend : "" };
  const put = (path: string, value: string | number | boolean, row?: PropDef): void => {
    const type = SCENE_VALUE_TYPES[path];
    if (!type) return;
    // A numeric enum row holds its option label; the scene gets the number.
    const stored =
      row && isNumericEnum(row) && typeof value === "string" ? (enumValueOf(row, value) ?? value) : value;
    out[path] = coerce(type, stored);
  };
  for (const p of s.commonProps) put(p.key, p.value, p);
  for (const p of s.backendProps) put(blockKey(s.backend, p.key), p.value, p);
  if (s.backend === "umbreon_npr") {
    put(blockKey("umbreon_npr", "hatchLayersSpec"), s.hatch?.layersSpec ?? "");
    put(blockKey("umbreon_npr", "hatchToneSpec"), s.hatch?.toneSpec ?? "");
  }
  return out;
}
