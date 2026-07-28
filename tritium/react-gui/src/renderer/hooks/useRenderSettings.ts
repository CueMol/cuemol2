/**
 * @file hooks/useRenderSettings.ts
 * @description Holds the (non-persistent) render-settings editing state
 * shown in the Inspector `renderSettings` target.
 *
 * Settings are split into a backend-independent set and the active
 * backend's own set. Switching backend keeps the common settings and
 * swaps in the new backend's defaults. A separate `preset` selection (used
 * by the BottomPanel Render tab) drives width / height; editing the size
 * directly resets the preset to "Custom". Phase 1 keeps a single in-memory
 * set; per-scene state is deferred to a later phase.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { PropDef } from "../data/rendererProperties";
import {
  RENDER_COMMON_PROPS,
  RENDER_SIZE_PRESETS,
  MOVIE_SIZE_PRESETS,
  DEFAULT_RENDER_PRESET,
  DEFAULT_STILL_PRESET,
  DEFAULT_MOVIE_PRESET,
  DEFAULT_MOVIE_SETTINGS,
  SIZE_UNIT_FIELD_META,
  sizePresetsForMode,
  sizeUnitToPx,
  pxToSizeUnit,
  lightingPatch,
  lightingOf,
  axisOwning,
  stepPatch,
  defaultQualitySteps,
  RENDER_QUALITY_CUSTOM,
  type RenderBackendId,
  type RenderMode,
  type MovieSettings,
  type RenderSizePreset,
  type RenderLightingMode,
  type RenderQualityConfig,
  type RenderQualitySteps,
  type RenderPropPatch,
} from "../data/renderSettings";
import { RENDER_BACKENDS, DEFAULT_RENDER_BACKEND } from "../data/renderBackends";
import type { RenderSettingsSnapshot } from "../data/renderResult";

/** Deep-copy a PropDef list so edits never mutate the shared defaults. */
const cloneProps = (props: PropDef[]): PropDef[] => props.map((p) => ({ ...p }));

/** Read a prop value by key (typed via the caller). */
const readVal = (props: PropDef[], key: string): string | number | boolean | undefined =>
  props.find((p) => p.key === key)?.value;

/** Apply a value change to whichever list owns `key` (returns a new list). */
const applyChange = (
  props: PropDef[],
  key: string,
  value: string | number | boolean,
): PropDef[] => {
  if (!props.some((p) => p.key === key)) return props;
  return props.map((p) => (p.key === key ? { ...p, value } : p));
};

/** Apply several values at once (used by the quality axes). */
const applyPatch = (props: PropDef[], patch: RenderPropPatch): PropDef[] => {
  if (!props.some((p) => p.key in patch)) return props;
  return props.map((p) => (p.key in patch ? { ...p, value: patch[p.key] } : p));
};

/** A backend's quality axes, or undefined when it declares none (POV-Ray). */
const qualityOf = (id: RenderBackendId): RenderQualityConfig | undefined =>
  RENDER_BACKENDS[id].quality;

/** Every axis of a backend at its default step (empty without a quality table). */
const initialQualitySteps = (id: RenderBackendId): RenderQualitySteps => {
  const cfg = qualityOf(id);
  return cfg ? defaultQualitySteps(cfg) : {};
};

/**
 * A backend's declared props with its default method and default step of every
 * axis already applied, so the dropdowns describe the values from the start.
 */
const backendPropsWithDefaults = (id: RenderBackendId): PropDef[] => {
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
const roundTo = (v: number, decimals: number): number => {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
};

/**
 * Set a width / height prop to `value` in `unit`, swapping in that unit's
 * editor metadata (type / range / step / decimals) and the unit suffix so the
 * control tracks the unit.
 */
const setSizeProp = (prop: PropDef, value: number, unit: string): PropDef => {
  const m = SIZE_UNIT_FIELD_META[unit as keyof typeof SIZE_UNIT_FIELD_META] ?? SIZE_UNIT_FIELD_META.px;
  return { ...prop, value, type: m.type, min: m.min, max: m.max, step: m.step, unit, decimals: m.decimals };
};

/**
 * Reproject the width / height values into `newUnit` and switch the unit prop.
 * Each value is converted old-unit -> px -> new-unit using the current DPI,
 * mirroring UXP `render-pov-dlg.js` `onImgSzUnitSel`.
 */
const convertSizeUnit = (props: PropDef[], newUnit: string): PropDef[] => {
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

export function useRenderSettings(
  { umbreonAvailable = false }: { umbreonAvailable?: boolean } = {},
) {
  const [backend, setBackendState] = useState<RenderBackendId>(DEFAULT_RENDER_BACKEND);
  const [commonProps, setCommonProps] = useState<PropDef[]>(() =>
    cloneProps(RENDER_COMMON_PROPS),
  );
  const [backendProps, setBackendProps] = useState<PropDef[]>(() =>
    cloneProps(backendPropsWithDefaults(DEFAULT_RENDER_BACKEND)),
  );
  // Still mode starts on its default preset; the common-prop defaults above
  // (1200 x 1200 px at 600 DPI) already match it, so no apply is needed here.
  const [preset, setPreset] = useState<string>(DEFAULT_STILL_PRESET);
  const [mode, setMode] = useState<RenderMode>("still");
  const [movie, setMovie] = useState<MovieSettings>(DEFAULT_MOVIE_SETTINGS);
  // Selected step per quality axis. The axes are independent, so each keeps its
  // own selection and falls back to "custom" on its own.
  const [qualitySteps, setQualitySteps] = useState<RenderQualitySteps>(() =>
    initialQualitySteps(DEFAULT_RENDER_BACKEND),
  );
  // Once the user (or a restore) picks a backend, stop auto-defaulting to umbreon.
  const userPickedRef = useRef(false);

  /** Switch the active backend, keeping common settings, resetting backend ones. */
  const applyBackend = useCallback((id: RenderBackendId) => {
    setBackendState(id);
    // Start the new backend on its default method + default step of every
    // axis, so the quality dropdowns and the prop values agree from the start.
    setBackendProps(cloneProps(backendPropsWithDefaults(id)));
    setQualitySteps(initialQualitySteps(id));
  }, []);

  /** User-initiated backend switch (sticks against the umbreon auto-default). */
  const setBackend = useCallback(
    (id: RenderBackendId) => {
      userPickedRef.current = true;
      applyBackend(id);
    },
    [applyBackend],
  );

  // Prefer umbreon as the initial default once we learn it is available -- but a
  // manual pick or a restored snapshot wins. `umbreonAvailable` is a static
  // build capability that only flips false -> true once, so this runs at most once.
  useEffect(() => {
    if (umbreonAvailable && !userPickedRef.current) {
      applyBackend("umbreon");
    }
  }, [umbreonAvailable, applyBackend]);

  // --- Quality axes (backend-provided; absent for POV-Ray) ---

  const quality = qualityOf(backend);

  /**
   * Active lighting method, derived from the props rather than stored, so the
   * Lighting selector can never disagree with the underlying switches.
   */
  const lighting: RenderLightingMode = quality
    ? lightingOf(quality, (key) => readVal(backendProps, key))
    : "none";

  /** Write a whole axis patch without invalidating the selected steps. */
  const applyQualityPatch = useCallback((patch: RenderPropPatch) => {
    setCommonProps((prev) => applyPatch(prev, patch));
    setBackendProps((prev) => applyPatch(prev, patch));
  }, []);

  /** Move one axis to a step, leaving every other axis where it is. */
  const setQualityStep = useCallback(
    (axisKey: string, stepId: string) => {
      setQualitySteps((prev) => ({ ...prev, [axisKey]: stepId }));
      // Custom is a state an axis falls into, not a set of values.
      if (!quality || stepId === RENDER_QUALITY_CUSTOM) return;
      const axis = quality.axes.find((a) => a.key === axisKey);
      if (axis) applyQualityPatch(stepPatch(axis, stepId));
    },
    [quality, applyQualityPatch],
  );

  /**
   * Switch the lighting method (AO / GI are mutually exclusive) and re-apply
   * that method's own axes at their selected steps. The shared axes (image
   * quality, shadows) are independent of the method and are left alone.
   */
  const setLighting = useCallback(
    (mode: RenderLightingMode) => {
      if (!quality) return;
      applyQualityPatch(lightingPatch(quality, mode, qualitySteps));
    },
    [quality, qualitySteps, applyQualityPatch],
  );

  /** Update a single setting value by key (common or backend-specific). */
  const handleChange = useCallback(
    (key: string, value: string | number | boolean) => {
      // Changing the unit reprojects the width / height values (and swaps in
      // the new unit's control metadata); it never matches a px-based preset.
      if (key === "unit") {
        setCommonProps((prev) => convertSizeUnit(prev, String(value)));
        return;
      }
      setCommonProps((prev) => applyChange(prev, key, value));
      setBackendProps((prev) => applyChange(prev, key, value));
      // A manual size edit no longer matches any preset.
      if (key === "width" || key === "height") {
        setPreset(DEFAULT_RENDER_PRESET);
      }
      // ... and a manual edit drops the owning axis to Custom, so its dropdown
      // never claims a step whose values the user has overridden. Only that
      // axis changes: the others still describe their own props correctly.
      const axis = quality ? axisOwning(quality, key) : undefined;
      if (axis) {
        setQualitySteps((prev) => ({ ...prev, [axis.key]: RENDER_QUALITY_CUSTOM }));
      }
    },
    [quality],
  );

  /** Write a preset's pixel size (and DPI) into the width / height fields. */
  const applyPresetSize = useCallback((sized: RenderSizePreset, size: { width: number; height: number }) => {
    // Presets are defined in pixels, so reset the unit to "px" and lay the
    // width / height fields out with the px metadata (UXP `onPresetSel`).
    setCommonProps((prev) => {
      let next = prev.map((p) =>
        p.key === "unit"
          ? { ...p, value: "px" }
          : p.key === "width"
            ? setSizeProp(p, size.width, "px")
            : p.key === "height"
              ? setSizeProp(p, size.height, "px")
              : p,
      );
      if (sized.dpi !== undefined) {
        next = applyChange(next, "dpi", sized.dpi);
      }
      return next;
    });
  }, []);

  /**
   * Apply a size preset (Render tab dropdown). "Custom" leaves the size
   * unchanged; the "Current view" preset uses the supplied `dynamicSize`.
   */
  const applyPreset = useCallback(
    (label: string, dynamicSize?: { width: number; height: number }) => {
      setPreset(label);
      const sized = sizePresetsForMode(mode).find((p) => p.label === label);
      if (!sized) return;

      let size: { width: number; height: number } | undefined;
      if (sized.dynamic) {
        size = dynamicSize;
      } else if (sized.width > 0) {
        size = { width: sized.width, height: sized.height };
      }
      if (size) applyPresetSize(sized, size);
    },
    [mode, applyPresetSize],
  );

  /**
   * Switch the render mode. Each mode jumps to its own default size preset
   * (still: high-res square; movie: QVGA) -- a preset from the other mode has
   * no match in this mode's list, and this also reprojects the size to px.
   */
  const changeMode = useCallback((next: RenderMode) => {
    setMode(next);
    const list = next === "movie" ? MOVIE_SIZE_PRESETS : RENDER_SIZE_PRESETS;
    const label = next === "movie" ? DEFAULT_MOVIE_PRESET : DEFAULT_STILL_PRESET;
    const def = list.find((p) => p.label === label);
    if (def && def.width > 0) {
      setPreset(def.label);
      applyPresetSize(def, { width: def.width, height: def.height });
    } else {
      setPreset(DEFAULT_RENDER_PRESET);
    }
  }, [applyPresetSize]);

  /** Frozen copy of the current settings, used for a render result. */
  const getSnapshot = useCallback(
    (): RenderSettingsSnapshot => ({
      mode,
      backend,
      commonProps: cloneProps(commonProps),
      backendProps: cloneProps(backendProps),
      ...(mode === "movie" ? { movie: { ...movie } } : {}),
    }),
    [mode, backend, commonProps, backendProps, movie],
  );

  /** Load settings from a snapshot (used by "Re-render"). */
  const restore = useCallback((snapshot: RenderSettingsSnapshot) => {
    // A restored snapshot carries its own backend; do not let the umbreon
    // auto-default override it afterwards.
    userPickedRef.current = true;
    setBackendState(snapshot.backend);
    setCommonProps(cloneProps(snapshot.commonProps));
    setBackendProps(cloneProps(snapshot.backendProps));
    setMode(snapshot.mode);
    if (snapshot.movie) setMovie({ ...snapshot.movie });
    // Restored sizes and quality values are explicit, so no preset is active.
    setPreset(DEFAULT_RENDER_PRESET);
    const cfg = qualityOf(snapshot.backend);
    setQualitySteps(
      cfg
        ? Object.fromEntries(cfg.axes.map((a) => [a.key, RENDER_QUALITY_CUSTOM]))
        : {},
    );
  }, []);

  /**
   * Default the Camera settings to what the render target view shows. Called
   * when the target changes, so a render starts from the same projection the
   * user is looking at; a later manual edit stands until the target changes
   * again. Only settings with a real counterpart are taken -- the view's
   * stereo mode is a display mode, not the render's eye selection.
   */
  const applyViewCamera = useCallback((camera: { perspective: boolean }) => {
    setCommonProps((prev) =>
      applyChange(
        prev,
        "projection",
        camera.perspective ? "perspective" : "orthographic",
      ),
    );
  }, []);

  /** Patch one or more movie settings. */
  const updateMovie = useCallback((patch: Partial<MovieSettings>) => {
    setMovie((prev) => ({ ...prev, ...patch }));
  }, []);

  return {
    mode,
    backend,
    commonProps,
    backendProps,
    movie,
    preset,
    lighting,
    qualitySteps,
    setLighting,
    setQualityStep,
    setMode: changeMode,
    setBackend,
    handleChange,
    updateMovie,
    applyPreset,
    applyViewCamera,
    getSnapshot,
    restore,
  } as const;
}
