/**
 * @file features/render/useRenderSettings.ts
 * @description Holds the render-settings editing state of the Rendering
 * window.
 *
 * Settings are split into a backend-independent set and the active
 * backend's own set. Switching backend keeps the common settings and
 * swaps in the new backend's defaults. A separate `preset` selection (used
 * by the BottomPanel Render tab) drives width / height; editing the size
 * directly resets the preset to "Custom".
 *
 * The settings belong to the render target's scene: `loadFromScene` swaps in
 * what a scene stores (see sceneRenderSettings.ts) and `userEditSeq` counts
 * the user's edits, so the owner (useSceneSettingsSync) can write them back
 * without mistaking a load, a restore or the target view's camera default
 * for an edit. This hook itself does no IPC.
 */

import { useState, useCallback } from "react";
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
import type { LoadedRenderSettings, StoredRenderSettings } from "./sceneRenderSettings";

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
  backendSpecs,
  cloneProps,
  convertSizeUnit,
  placeholderProps,
  qualityOf,
  readVal,
  setSizeProp,
  sizePresetOf,
} from "./propMath";
export type { HatchEditState } from "./propMath";
import { useHatchSpecEditor } from "./useHatchSpecEditor";

export function useRenderSettings() {
  // Every value comes from the target scene (loadFromScene); until the first
  // load lands the rows hold placeholders and the window stays hidden.
  const [backend, setBackendState] = useState<RenderBackendId>(DEFAULT_RENDER_BACKEND);
  const [backendExplicit, setBackendExplicit] = useState(false);
  const [commonProps, setCommonProps] = useState<PropDef[]>(() =>
    placeholderProps(RENDER_COMMON_PROPS),
  );
  const [backendProps, setBackendProps] = useState<PropDef[]>(() =>
    placeholderProps(backendSpecs(DEFAULT_RENDER_BACKEND)),
  );
  const [preset, setPreset] = useState<string>(DEFAULT_RENDER_PRESET);
  const [mode, setMode] = useState<RenderMode>("still");
  const [movie, setMovie] = useState<MovieSettings>(DEFAULT_MOVIE_SETTINGS);

  /**
   * Counts the user's edits. Bumped only by the edit paths (a value change,
   * a backend / lighting / quality / preset pick, a hatch edit), never by a
   * load, a restore or a camera default -- the owner writes the settings to
   * the scene when this moves.
   */
  const [userEditSeq, setUserEditSeq] = useState(0);
  const markUserEdit = useCallback(() => setUserEditSeq((s) => s + 1), []);

  // --- NPR hatch look (layer editor) ---

  /** The selected hatch style (umbreon_npr backend prop). */
  const hatchStyle = String(readVal(backendProps, "hatchStyle") ?? "");
  const {
    hatch, hatchLoaded, hatchDirty, applyHatchTemplate, updateHatchLayer,
    addHatchLayer, removeHatchLayer, duplicateHatchLayer, updateHatchTone,
    updateHatchInk, resetHatchToTemplate, setHatch,
  } = useHatchSpecEditor({ hatchStyle, onEdit: markUserEdit });

  /**
   * User-initiated backend switch. The new backend's rows come from the
   * caller (the scene's block for that backend, defaults included -- see
   * useSceneSettingsSync.backendPropsFor); the common settings stay.
   */
  const setBackend = useCallback(
    (id: RenderBackendId, blockProps: PropDef[]) => {
      setBackendState(id);
      setBackendExplicit(true);
      setBackendProps(cloneProps(blockProps));
      setHatch(INITIAL_HATCH);
      markUserEdit();
    },
    [setHatch, markUserEdit],
  );

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
      if (!axis) return;
      applyQualityPatch(stepPatch(axis, stepId));
      markUserEdit();
    },
    [quality, applyQualityPatch, markUserEdit],
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
      markUserEdit();
    },
    [quality, qualitySteps, applyQualityPatch, markUserEdit],
  );

  /** Update a single setting value by key (common or backend-specific). */
  const handleChange = useCallback(
    (key: string, value: string | number | boolean) => {
      // Changing the unit reprojects the width / height values (and swaps in
      // the new unit's control metadata); it never matches a px-based preset.
      markUserEdit();
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
    [setHatch, markUserEdit],
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
      if (size) {
        applyPresetSize(sized, size);
        markUserEdit();
      }
    },
    [mode, applyPresetSize, markUserEdit],
  );

  /**
   * Switch the render mode. Each mode jumps to its own default size preset
   * (still: high-res square; movie: QVGA) -- a preset from the other mode has
   * no match in this mode's list, and this also reprojects the size to px.
   *
   * Not counted as a user edit: the mode is not scene data, and the Rendering
   * menu switches it when it opens the window. The size it applies reaches
   * the scene with the next edit or render.
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


  /**
   * Frozen copy of the settings.
   *
   * 'render' (default) carries the edited hatch look only while it differs
   * from the template, so an untouched style renders through the C++ side's
   * own configuration. 'store' -- what the scene keeps -- also carries it
   * while the template is not known yet (right after a load), so a write in
   * that window does not erase the look the scene holds.
   */
  const getSnapshot = useCallback(
    (purpose: "render" | "store" = "render"): RenderSettingsSnapshot => {
      const keepHatch =
        backend === "umbreon_npr" &&
        hatch.spec !== null &&
        (hatchDirty || (purpose === "store" && hatch.template === null));
      return {
        mode,
        backend,
        commonProps: cloneProps(commonProps),
        backendProps: cloneProps(backendProps),
        ...(mode === "movie" ? { movie: { ...movie } } : {}),
        ...(keepHatch && hatch.spec
          ? {
              hatch: {
                layersSpec: formatHatchLayersSpec(hatch.spec.layers),
                toneSpec: formatHatchToneSpec(hatch.spec.tone, hatch.spec.ink),
              },
            }
          : {}),
      };
    },
    [mode, backend, commonProps, backendProps, movie, hatch.spec, hatch.template, hatchDirty],
  );

  /**
   * Replace the backend, its props, the common props and the hatch look.
   * `presetMode` is the mode whose size presets the loaded size is matched
   * against (the preset dropdown shows the entry the size equals, else Custom).
   */
  const applySettings = useCallback((s: StoredRenderSettings, presetMode: RenderMode, explicit: boolean) => {
    setBackendState(s.backend);
    setBackendExplicit(explicit);
    setCommonProps(cloneProps(s.commonProps));
    setBackendProps(cloneProps(s.backendProps));
    // The quality dropdowns need no reset: they read the values back.
    setPreset(sizePresetOf(s.commonProps, presetMode));
    // An edited look comes back as the spec; its template is fetched again
    // (applyHatchTemplate keeps the spec and only fills the template in).
    setHatch(
      s.hatch
        ? {
            style: String(readVal(s.backendProps, "hatchStyle") ?? ""),
            template: null,
            spec: parseHatchSpec(s.hatch.layersSpec + "\n" + s.hatch.toneSpec),
          }
        : INITIAL_HATCH,
    );
  }, [setHatch]);

  /**
   * Load settings from a render's snapshot ("Use settings" on a history
   * entry). The snapshot's backend is what rendered that image, so it counts
   * as chosen.
   */
  const restore = useCallback((snapshot: RenderSettingsSnapshot) => {
    applySettings(snapshot, snapshot.mode, true);
    setMode(snapshot.mode);
    if (snapshot.movie) setMovie({ ...snapshot.movie });
  }, [applySettings]);

  /**
   * Show what the target scene stores (its own values, or a fresh object's
   * defaults). Not an edit: nothing is written back until the user changes
   * something.
   */
  const loadFromScene = useCallback(
    (loaded: LoadedRenderSettings) => {
      applySettings(loaded, mode, loaded.backendExplicit);
    },
    [applySettings, mode],
  );

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
    loadFromScene,
    userEditSeq,
    backendExplicit,
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
