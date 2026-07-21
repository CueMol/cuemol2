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
  DEFAULT_RENDER_PRESET,
  DEFAULT_MOVIE_SETTINGS,
  SIZE_UNIT_FIELD_META,
  sizePresetsForMode,
  sizeUnitToPx,
  pxToSizeUnit,
  type RenderBackendId,
  type RenderMode,
  type MovieSettings,
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
    cloneProps(RENDER_BACKENDS[DEFAULT_RENDER_BACKEND].props),
  );
  const [preset, setPreset] = useState<string>(DEFAULT_RENDER_PRESET);
  const [mode, setMode] = useState<RenderMode>("still");
  const [movie, setMovie] = useState<MovieSettings>(DEFAULT_MOVIE_SETTINGS);
  // Once the user (or a restore) picks a backend, stop auto-defaulting to umbreon.
  const userPickedRef = useRef(false);

  /** Switch the active backend, keeping common settings, resetting backend ones. */
  const applyBackend = useCallback((id: RenderBackendId) => {
    setBackendState(id);
    setBackendProps(cloneProps(RENDER_BACKENDS[id].props));
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
    },
    [],
  );

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
      if (!size) return;

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
    },
    [mode],
  );

  /**
   * Switch the render mode. The preset lists differ per mode (video
   * resolutions for movies), so a selected preset from the other mode would
   * not exist in the new list -- reset it to the neutral "Custom".
   */
  const changeMode = useCallback((next: RenderMode) => {
    setMode(next);
    setPreset(DEFAULT_RENDER_PRESET);
    // Movie output is pixel-based and hides the unit / DPI controls, so drop
    // any physical unit left over from still mode (reprojecting to px).
    if (next === "movie") {
      setCommonProps((prev) => convertSizeUnit(prev, "px"));
    }
  }, []);

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
    // Restored sizes are explicit, so no preset is active.
    setPreset(DEFAULT_RENDER_PRESET);
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
    setMode: changeMode,
    setBackend,
    handleChange,
    updateMovie,
    applyPreset,
    getSnapshot,
    restore,
  } as const;
}
