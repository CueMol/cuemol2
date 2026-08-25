/**
 * @file data/hatchSpec.ts
 * @description The umbreon hatch spec text (`layer:` / `tone:` / `ink:`
 * lines) as typed records, with the parse / format pair the layer editor and
 * the NPR render backend share. Pure module: no React, no IPC.
 *
 * The grammar is umbreon's (npr/hatch_shade.hpp, applyHatchSpec): one
 * `layer:` line per mark layer, a `tone:` line for the tone recipe and an
 * `ink:` line for the paper / ink model, each a comma-separated list of
 * `key=value` entries. Numbers use the C locale, booleans are on/off, colors
 * #rrggbb. Record fields are named after the spec keys, and one field table
 * per section drives parsing, formatting, defaults and the editor's ranges,
 * so a key added on the C++ side is one table row here. Unknown keys survive
 * a round trip through `extra`.
 */

// --- Types ---

export type HatchLayerKind = "line" | "dot" | "stipple";

/** One mark layer (a "pencil" of the drawing). */
export interface HatchLayer {
  /** Stable UI key; never written to the spec text. */
  id: string;
  kind: HatchLayerKind;
  angle: number;
  spacing: number;
  subdiv: number;
  /** Line layers: full line width (output px). */
  width: number;
  /** Dot / Stipple layers: relative dot radius (1 = area-exact). */
  dotscale: number;
  tonehi: number;
  tonelo: number;
  /** Grow-in speed below the appearance threshold; 0 = auto (continuous). */
  fade: number;
  opacity: number;
  inkscale: number;
  soft: number;
  seed: number;
  jitter: number;
  wobble: number;
  wobwave: number;
  wjitter: number;
  slen: number;
  sgap: number;
  taper: number;
  anglejitter: number;
  lenjitter: number;
  tooth: number;
  toothscale: number;
  shape: number;
  aspect: number;
  dotangle: number;
  invert: boolean;
  /** Keys this module does not know, kept verbatim for the round trip. */
  extra: Record<string, string>;
}

/** The tone recipe: how the shading tone becomes an ink amount. */
export interface HatchTone {
  /** Ink gain in coverage space (1 = the style's own). Primary control. */
  strength: number;
  /** Coverage exponent: > 1 lighter mid tones, < 1 heavier. Primary control. */
  curve: number;
  diffuse: number;
  ambient: number;
  wrap: number;
  rim: number;
  rimpow: number;
  rimbias: number;
  contact: number;
  shape: number;
  black: number;
  white: number;
  hl: number;
  hlsoft: number;
  gamma: number;
  speccut: number;
  levels: number;
  extra: Record<string, string>;
}

/** The paper / ink model. The base / ink / color keys are kept as text: the
 * Coloring dropdown and the custom colors own them in the GUI. */
export interface HatchInk {
  mode: string;
  base: string;
  ink: string;
  inkcolor: string;
  papercolor: string;
  mincontrast: number;
  inkshade: number;
  tonefog: boolean;
  albedoquant: number;
  extra: Record<string, string>;
}

export interface HatchSpec {
  layers: HatchLayer[];
  tone: HatchTone;
  ink: HatchInk;
}

// --- Field tables ---

/** Where the editor shows a field. */
export type HatchFieldPlace = "primary" | "advanced";

export interface HatchFieldDef {
  /** Spec key == record field name. */
  key: string;
  type: "num" | "int" | "bool" | "str";
  def: number | boolean | string;
  label: string;
  place: HatchFieldPlace;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Layer fields only: the kinds the field applies to (absent = all). */
  kinds?: HatchLayerKind[];
}

const LINE: HatchLayerKind[] = ["line"];
const DOTS: HatchLayerKind[] = ["dot", "stipple"];
const DOT: HatchLayerKind[] = ["dot"];
/** Kinds with nesting levels (a Stipple layer is one flat lattice). */
const LATTICE: HatchLayerKind[] = ["line", "dot"];

/** Mark-layer fields, in the order the spec text lists them. */
export const LAYER_FIELDS: readonly HatchFieldDef[] = [
  { key: "angle", type: "num", def: 45, label: "Angle", place: "primary", min: -180, max: 180, step: 1, unit: "deg" },
  { key: "spacing", type: "num", def: 10, label: "Spacing", place: "primary", min: 0.25, max: 64, step: 0.25, unit: "px" },
  { key: "subdiv", type: "int", def: 2, label: "Nesting levels", place: "advanced", min: 0, max: 5, step: 1, kinds: LATTICE },
  { key: "width", type: "num", def: 1.1, label: "Width", place: "primary", min: 0.1, max: 8, step: 0.05, unit: "px", kinds: LINE },
  { key: "dotscale", type: "num", def: 1, label: "Dot scale", place: "primary", min: 0.1, max: 8, step: 0.05, kinds: DOTS },
  { key: "tonehi", type: "num", def: 0.95, label: "Tone high", place: "primary", min: 0, max: 1, step: 0.01 },
  { key: "tonelo", type: "num", def: 0.55, label: "Tone low", place: "primary", min: 0, max: 1, step: 0.01 },
  { key: "fade", type: "num", def: 16, label: "Fade (0 = auto)", place: "primary", min: 0, max: 64, step: 1 },
  { key: "opacity", type: "num", def: 1, label: "Opacity", place: "primary", min: 0, max: 1, step: 0.05 },
  { key: "inkscale", type: "num", def: 1, label: "Ink darkness", place: "primary", min: 0, max: 1, step: 0.02 },
  { key: "soft", type: "num", def: 0.5, label: "Edge softness", place: "advanced", min: 0.5, max: 2, step: 0.05, unit: "px" },
  { key: "seed", type: "int", def: 0, label: "Seed", place: "advanced", min: 0, max: 9999, step: 1 },
  { key: "jitter", type: "num", def: 0, label: "Position jitter", place: "advanced", min: 0, max: 0.5, step: 0.01 },
  { key: "wobble", type: "num", def: 0, label: "Wobble", place: "advanced", min: 0, max: 8, step: 0.1, unit: "px", kinds: LINE },
  { key: "wobwave", type: "num", def: 40, label: "Wobble wavelength", place: "advanced", min: 2, max: 200, step: 1, unit: "px", kinds: LINE },
  { key: "wjitter", type: "num", def: 0, label: "Width jitter", place: "advanced", min: 0, max: 1, step: 0.05, kinds: LINE },
  { key: "slen", type: "num", def: 0, label: "Stroke length", place: "advanced", min: 0, max: 200, step: 1, unit: "px", kinds: LINE },
  { key: "sgap", type: "num", def: 0, label: "Stroke gap", place: "advanced", min: 0, max: 50, step: 0.5, unit: "px", kinds: LINE },
  { key: "taper", type: "num", def: 0.3, label: "Stroke taper", place: "advanced", min: 0, max: 0.9, step: 0.05, kinds: LINE },
  { key: "anglejitter", type: "num", def: 0, label: "Angle jitter", place: "advanced", min: 0, max: 15, step: 0.5, unit: "deg", kinds: LINE },
  { key: "lenjitter", type: "num", def: 0, label: "Length jitter", place: "advanced", min: 0, max: 0.9, step: 0.05, kinds: LINE },
  { key: "shape", type: "num", def: 2, label: "Shape exponent", place: "advanced", min: 1, max: 16, step: 0.5, kinds: DOTS },
  { key: "aspect", type: "num", def: 1, label: "Aspect", place: "advanced", min: 0.5, max: 2, step: 0.05, kinds: DOTS },
  { key: "dotangle", type: "num", def: 0, label: "Dot angle", place: "advanced", min: -90, max: 90, step: 1, unit: "deg", kinds: DOTS },
  { key: "invert", type: "bool", def: true, label: "Merge to solid", place: "advanced", kinds: DOT },
  { key: "tooth", type: "num", def: 0, label: "Paper tooth", place: "advanced", min: 0, max: 1, step: 0.05 },
  { key: "toothscale", type: "num", def: 3, label: "Tooth scale", place: "advanced", min: 0.5, max: 20, step: 0.5, unit: "px" },
];

/** Tone-recipe fields; strength / curve first (the primary controls). */
export const TONE_FIELDS: readonly HatchFieldDef[] = [
  { key: "strength", type: "num", def: 1, label: "Strength", place: "primary", min: 0.25, max: 3, step: 0.05 },
  { key: "curve", type: "num", def: 1, label: "Curve", place: "primary", min: 0.5, max: 2, step: 0.05 },
  { key: "diffuse", type: "num", def: 1, label: "Diffuse weight", place: "advanced", min: 0, max: 2, step: 0.05 },
  { key: "ambient", type: "num", def: 0.12, label: "Ambient", place: "advanced", min: 0, max: 0.5, step: 0.01 },
  { key: "wrap", type: "num", def: 0, label: "Wrap", place: "advanced", min: 0, max: 1, step: 0.05 },
  { key: "rim", type: "num", def: 0, label: "Contour darkening", place: "advanced", min: 0, max: 1, step: 0.05 },
  { key: "rimpow", type: "num", def: 1, label: "Contour power", place: "advanced", min: 0.5, max: 8, step: 0.1 },
  { key: "rimbias", type: "num", def: 0.6, label: "Contour light bias", place: "advanced", min: 0, max: 1, step: 0.05 },
  { key: "contact", type: "num", def: 1, label: "Contact AO", place: "advanced", min: 0, max: 2, step: 0.05 },
  { key: "shape", type: "num", def: 0.6, label: "Shape AO", place: "advanced", min: 0, max: 2, step: 0.05 },
  { key: "black", type: "num", def: 0, label: "Black point", place: "advanced", min: 0, max: 0.5, step: 0.01 },
  { key: "white", type: "num", def: 1, label: "White point", place: "advanced", min: 0.5, max: 2, step: 0.01 },
  { key: "hl", type: "num", def: 1, label: "Highlight knee", place: "advanced", min: 0.5, max: 1, step: 0.01 },
  { key: "hlsoft", type: "num", def: 0.06, label: "Highlight softness", place: "advanced", min: 0, max: 0.3, step: 0.01 },
  { key: "gamma", type: "num", def: 1, label: "Gamma", place: "advanced", min: 0.2, max: 4, step: 0.05 },
  { key: "speccut", type: "num", def: 0, label: "Specular cut", place: "advanced", min: 0, max: 2, step: 0.05 },
  { key: "levels", type: "int", def: 0, label: "Tone levels", place: "advanced", min: 0, max: 16, step: 1 },
];

/** Paper / ink model fields. */
export const INK_FIELDS: readonly HatchFieldDef[] = [
  { key: "mode", type: "str", def: "ink", label: "Mode", place: "advanced" },
  { key: "base", type: "str", def: "paper", label: "Base", place: "advanced" },
  { key: "ink", type: "str", def: "fixed", label: "Ink", place: "advanced" },
  { key: "inkcolor", type: "str", def: "#000000", label: "Ink color", place: "advanced" },
  { key: "papercolor", type: "str", def: "#ffffff", label: "Paper color", place: "advanced" },
  { key: "mincontrast", type: "num", def: 0.25, label: "Min contrast", place: "advanced", min: 0, max: 1, step: 0.05 },
  { key: "inkshade", type: "num", def: 1, label: "Ink shade", place: "advanced", min: 0, max: 1, step: 0.05 },
  { key: "tonefog", type: "bool", def: true, label: "Tone fog", place: "advanced" },
  { key: "albedoquant", type: "int", def: 0, label: "Fill posterize", place: "advanced", min: 0, max: 16, step: 1 },
];

/** Whether a layer field applies to a layer kind. */
export const fieldAppliesTo = (f: HatchFieldDef, kind: HatchLayerKind): boolean =>
  !f.kinds || f.kinds.includes(kind);

// --- Fields with no effect under the current values (shown disabled) ---

/**
 * Whether a layer field currently has any effect on the picture, given the
 * layer's other values (umbreon npr/hatch_ink.hpp): a field that another
 * value switches off is shown disabled rather than silently ignored.
 */
export function layerFieldEnabled(key: string, l: HatchLayer): boolean {
  const line = l.kind === "line";
  switch (key) {
    // No nesting and a fixed fade: only toneHi gates the marks.
    case "tonelo":
      return l.kind === "stipple" || l.subdiv > 0 || l.fade <= 0;
    // The wavelength drives the wobble and the width modulation noise.
    case "wobwave":
      return l.wobble > 0 || l.wjitter > 0;
    // Stroke-only parameters (a continuous line has no strokes).
    case "sgap":
    case "taper":
    case "anglejitter":
    case "lenjitter":
      return l.slen > 0;
    case "toothscale":
      return l.tooth > 0;
    // A circle does not rotate.
    case "dotangle":
      return !(l.aspect === 1 && l.shape === 2);
    // The seed feeds the hashes: nothing to seed without any randomness
    // (a Stipple layer always hashes its thresholds).
    case "seed":
      return (
        l.kind === "stipple" ||
        l.jitter > 0 ||
        l.tooth > 0 ||
        (line && (l.wobble > 0 || l.wjitter > 0 || l.slen > 0))
      );
    default:
      return true;
  }
}

/** Render-settings context the tone / ink fields depend on. */
export interface HatchFieldEnv {
  /** Ambient occlusion is on (the AO exponents shape the tone only then). */
  aoEnabled: boolean;
  /** The fill under the marks is the object color (albedo), not paper. */
  baseIsAlbedo: boolean;
}

/** Whether a tone-recipe field currently has any effect. */
export function toneFieldEnabled(key: string, t: HatchTone, env: HatchFieldEnv): boolean {
  switch (key) {
    case "hlsoft":
      return t.hl < 1;
    case "rimpow":
    case "rimbias":
      return t.rim > 0;
    case "contact":
    case "shape":
      return env.aoEnabled;
    default:
      return true;
  }
}

/** Whether an ink-model field currently has any effect. */
export function inkFieldEnabled(key: string, _ink: HatchInk, env: HatchFieldEnv): boolean {
  switch (key) {
    case "albedoquant":
      return env.baseIsAlbedo;
    default:
      return true;
  }
}

// --- Defaults / construction ---

let idSeq = 0;
/** A fresh UI id for a layer. */
export const nextHatchLayerId = (): string => `hl${++idSeq}`;

const defaultsOf = (fields: readonly HatchFieldDef[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.key] = f.def;
  return out;
};

export const DEFAULT_HATCH_TONE: HatchTone = {
  ...(defaultsOf(TONE_FIELDS) as unknown as Omit<HatchTone, "extra">),
  extra: {},
};

export const DEFAULT_HATCH_INK: HatchInk = {
  ...(defaultsOf(INK_FIELDS) as unknown as Omit<HatchInk, "extra">),
  extra: {},
};

/** A new layer of `kind` with umbreon's field defaults. */
export const newHatchLayer = (kind: HatchLayerKind, id: string = nextHatchLayerId()): HatchLayer => ({
  ...(defaultsOf(LAYER_FIELDS) as unknown as Omit<HatchLayer, "id" | "kind" | "extra">),
  id,
  kind,
  extra: {},
});

/** Deep copy with fresh layer ids (a template becoming the editable copy). */
export const cloneHatchSpec = (spec: HatchSpec): HatchSpec => ({
  layers: spec.layers.map((l) => ({ ...l, id: nextHatchLayerId(), extra: { ...l.extra } })),
  tone: { ...spec.tone, extra: { ...spec.tone.extra } },
  ink: { ...spec.ink, extra: { ...spec.ink.extra } },
});

// --- Parse ---

const parseBool = (v: string): boolean | undefined => {
  const t = v.trim().toLowerCase();
  if (t === "on" || t === "1" || t === "true") return true;
  if (t === "off" || t === "0" || t === "false") return false;
  return undefined;
};

/** Apply `key=value` entries onto a record by its field table. */
const applyEntries = (
  target: Record<string, unknown>,
  fields: readonly HatchFieldDef[],
  entries: string,
): void => {
  const extra = target.extra as Record<string, string>;
  for (const raw of entries.split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const eq = entry.indexOf("=");
    if (eq < 0) continue;
    const key = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1).trim();
    if (key === "kind") {
      if (value === "line" || value === "dot" || value === "stipple") target.kind = value;
      continue;
    }
    const f = fields.find((d) => d.key === key);
    if (!f) {
      extra[key] = value;
      continue;
    }
    if (f.type === "bool") {
      const b = parseBool(value);
      if (b !== undefined) target[key] = b;
    } else if (f.type === "str") {
      target[key] = value;
    } else {
      const n = Number(value);
      if (Number.isFinite(n)) target[key] = f.type === "int" ? Math.trunc(n) : n;
    }
  }
};

/**
 * Parse a spec text. Missing keys take the defaults, unknown keys land in
 * `extra`, blank lines / `#` comments / unknown sections are skipped, and no
 * value is clamped (the text is the C++ side's truth).
 */
export function parseHatchSpec(text: string): HatchSpec {
  const spec: HatchSpec = {
    layers: [],
    tone: { ...DEFAULT_HATCH_TONE, extra: {} },
    ink: { ...DEFAULT_HATCH_INK, extra: {} },
  };
  for (const rawLine of text.split(/\r?\n|;/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const section = line.slice(0, colon).trim();
    const entries = line.slice(colon + 1);
    if (section === "layer") {
      const layer = newHatchLayer("line");
      applyEntries(layer as unknown as Record<string, unknown>, LAYER_FIELDS, entries);
      spec.layers.push(layer);
    } else if (section === "tone") {
      applyEntries(spec.tone as unknown as Record<string, unknown>, TONE_FIELDS, entries);
    } else if (section === "ink") {
      applyEntries(spec.ink as unknown as Record<string, unknown>, INK_FIELDS, entries);
    }
  }
  return spec;
}

// --- Format ---

/** Number text without float noise (0.1 + 0.2 -> "0.3"). */
const fmtNum = (v: number): string => String(Number(v.toFixed(4)));

const formatEntries = (
  source: Record<string, unknown>,
  fields: readonly HatchFieldDef[],
  keep: (f: HatchFieldDef) => boolean,
): string => {
  const parts: string[] = [];
  for (const f of fields) {
    if (!keep(f)) continue;
    const v = source[f.key];
    if (f.type === "bool") parts.push(`${f.key}=${v ? "on" : "off"}`);
    else if (f.type === "str") parts.push(`${f.key}=${String(v)}`);
    else parts.push(`${f.key}=${fmtNum(Number(v))}`);
  }
  const extra = (source.extra ?? {}) as Record<string, string>;
  for (const key of Object.keys(extra)) parts.push(`${key}=${extra[key]}`);
  return parts.join(",");
};

/** The `layer:` lines (one per layer, keys filtered by the layer's kind). */
export function formatHatchLayersSpec(layers: HatchLayer[]): string {
  return layers
    .map((l) => {
      const body = formatEntries(l as unknown as Record<string, unknown>, LAYER_FIELDS, (f) =>
        fieldAppliesTo(f, l.kind),
      );
      return `layer: kind=${l.kind}${body ? "," + body : ""}\n`;
    })
    .join("");
}

/** The `tone:` and `ink:` lines. */
export function formatHatchToneSpec(tone: HatchTone, ink: HatchInk): string {
  const t = formatEntries(tone as unknown as Record<string, unknown>, TONE_FIELDS, () => true);
  const i = formatEntries(ink as unknown as Record<string, unknown>, INK_FIELDS, () => true);
  return `tone: ${t}\nink: ${i}\n`;
}

/** The whole text (layers, then tone and ink). */
export const formatHatchSpec = (spec: HatchSpec): string =>
  formatHatchLayersSpec(spec.layers) + formatHatchToneSpec(spec.tone, spec.ink);

/** Same configuration (layer ids ignored). */
export const isSameHatchSpec = (a: HatchSpec, b: HatchSpec): boolean =>
  formatHatchSpec(a) === formatHatchSpec(b);
