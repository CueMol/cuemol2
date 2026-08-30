/**
 * @file features/render/useRenderSettings.ts
 * @description Holds the (non-persistent) render-settings editing state
 * shown in the Inspector `renderSettings` target.
 *
 * Settings are split into a backend-independent set and the active
 * backend's own set. Switching backend keeps the common settings and
 * swaps in the new backend's defaults. A separate `preset` selection (used
 * by the BottomPanel Render tab) drives width / height; editing the size
 * directly resets the preset to "Custom". A single in-memory set is shared by
 * every scene; per-scene render settings are not implemented.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { PropDef } from "@renderer/data/rendererProperties";
import {
  RENDER_COMMON_PROPS,
  RENDER_SIZE_PRESETS,
  MOVIE_SIZE_PRESETS,
  DEFAULT_RENDER_PRESET,
  DEFAULT_STILL_PRESET,
  DEFAULT_MOVIE_PRESET,
  DEFAULT_MOVIE_SETTINGS,
  sizePresetsForMode,
  lightingPatch,
  lightingOf,
  qualityStepsOf,
  stepPatch,
  RENDER_QUALITY_CUSTOM,
  type RenderBackendId,
  type RenderMode,
  type MovieSettings,
  type RenderSizePreset,
  type RenderLightingMode,
  type RenderQualitySteps,
  type RenderPropPatch,
} from "@renderer/data/renderSettings";
import { DEFAULT_RENDER_BACKEND } from "@renderer/data/renderBackends";
import type { RenderSettingsSnapshot } from "@renderer/data/renderResult";
import {
  formatHatchLayersSpec,
  formatHatchToneSpec,
  parseHatchSpec,
} from "@renderer/data/hatchSpec";

/**
 * The NPR hatch look being edited. The selected style (backend prop
 * "hatchStyle") is a template: `template` is what the C++ side resolved it
 * to, `spec` the editable copy. Both are null until the template arrives (or
 * while the backend is not umbreon_npr).
 */import {
  INITIAL_HATCH,
  NO_QUALITY_STEPS,
  applyChange,
  applyPatch,
  backendPropsWithDefaults,
  cloneProps,
  convertSizeUnit,
  qualityOf,
  readVal,
  setSizeProp,
} from "./propMath";
export type { HatchEditState } from "./propMath";
import { useHatchSpecEditor } from "./useHatchSpecEditor";

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
  // Once the user (or a restore) picks a backend, stop auto-defaulting to umbreon.
  const userPickedRef = useRef(false);

  /** Switch the active backend, keeping common settings, resetting backend ones. */
  // --- NPR hatch look (layer editor) ---

  /** The selected hatch style (umbreon_npr backend prop). */
  const hatchStyle = String(readVal(backendProps, "hatchStyle") ?? "");
  const {
    hatch, hatchLoaded, hatchDirty, applyHatchTemplate, updateHatchLayer,
    addHatchLayer, removeHatchLayer, duplicateHatchLayer, updateHatchTone,
    updateHatchInk, resetHatchToTemplate, setHatch,
  } = useHatchSpecEditor({ hatchStyle });

  const applyBackend = useCallback((id: RenderBackendId) => {
    setBackendState(id);
    // Start the new backend on its default method + default step of every
    // axis, so the quality dropdowns and the prop values agree from the start.
    setBackendProps(cloneProps(backendPropsWithDefaults(id)));
    setHatch(INITIAL_HATCH);
  }, [setHatch]);

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
  const readSetting = useCallback(
    (key: string) => readVal(backendProps, key) ?? readVal(commonProps, key),
    [backendProps, commonProps],
  );

  const lighting: RenderLightingMode = quality
    ? lightingOf(quality, readSetting)
    : "none";

  /**
   * Step each axis' values currently represent. Derived, not remembered: a
   * stored pick goes stale whenever anything else writes the props (switching
   * method, restoring a render's snapshot), which showed "Custom" over values
   * that plainly matched a step.
   */
  const qualitySteps: RenderQualitySteps = quality
    ? qualityStepsOf(quality, readSetting)
    : NO_QUALITY_STEPS;

  /** Write a whole axis patch without invalidating the selected steps. */
  const applyQualityPatch = useCallback((patch: RenderPropPatch) => {
    setCommonProps((prev) => applyPatch(prev, patch));
    setBackendProps((prev) => applyPatch(prev, patch));
  }, []);

  /** Move one axis to a step, leaving every other axis where it is. */
  const setQualityStep = useCallback(
    (axisKey: string, stepId: string) => {
      // Custom is what an axis reads as, not something to apply.
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
      // A new hatch style is a new template: drop the edited look and let the
      // template hook fetch the style (no confirmation -- the state is
      // window-local, and the "Edited" badge tells the user it will go).
      if (key === "hatchStyle") {
        setHatch(INITIAL_HATCH);
      }
      // An edit needs no bookkeeping: each axis' dropdown reads back from the
      // values, so it drops to Custom -- or lands on another step -- by itself.
    },
    [setHatch],
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


  const getSnapshot = useCallback(
    (): RenderSettingsSnapshot => ({
      mode,
      backend,
      commonProps: cloneProps(commonProps),
      backendProps: cloneProps(backendProps),
      ...(mode === "movie" ? { movie: { ...movie } } : {}),
      // The edited look travels only while it differs from the template, so
      // an untouched style renders through the C++ side's own configuration.
      ...(backend === "umbreon_npr" && hatchDirty && hatch.spec
        ? {
            hatch: {
              layersSpec: formatHatchLayersSpec(hatch.spec.layers),
              toneSpec: formatHatchToneSpec(hatch.spec.tone, hatch.spec.ink),
            },
          }
        : {}),
    }),
    [mode, backend, commonProps, backendProps, movie, hatch.spec, hatchDirty],
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
    // Restored sizes are explicit, so no size preset is active. The quality
    // dropdowns need no reset: they read the restored values back.
    setPreset(DEFAULT_RENDER_PRESET);
    // An edited look comes back as the spec; its template is fetched again
    // (applyHatchTemplate keeps the spec and only fills the template in).
    setHatch(
      snapshot.hatch
        ? {
            style: String(readVal(snapshot.backendProps, "hatchStyle") ?? ""),
            template: null,
            spec: parseHatchSpec(snapshot.hatch.layersSpec + "\n" + snapshot.hatch.toneSpec),
          }
        : INITIAL_HATCH,
    );
  }, [setHatch]);

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
    hatch,
    hatchStyle,
    hatchLoaded,
    hatchDirty,
    applyHatchTemplate,
    updateHatchLayer,
    addHatchLayer,
    removeHatchLayer,
    duplicateHatchLayer,
    updateHatchTone,
    updateHatchInk,
    resetHatchToTemplate,
  } as const;
}
