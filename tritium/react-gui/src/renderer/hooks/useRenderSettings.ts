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

import { useState, useCallback } from "react";
import type { PropDef } from "../data/rendererProperties";
import {
  RENDER_COMMON_PROPS,
  RENDER_SIZE_PRESETS,
  DEFAULT_RENDER_PRESET,
  type RenderBackendId,
} from "../data/renderSettings";
import { RENDER_BACKENDS, DEFAULT_RENDER_BACKEND } from "../data/renderBackends";
import type { RenderSettingsSnapshot } from "../data/renderResult";

/** Deep-copy a PropDef list so edits never mutate the shared defaults. */
const cloneProps = (props: PropDef[]): PropDef[] => props.map((p) => ({ ...p }));

/** Apply a value change to whichever list owns `key` (returns a new list). */
const applyChange = (
  props: PropDef[],
  key: string,
  value: string | number | boolean,
): PropDef[] => {
  if (!props.some((p) => p.key === key)) return props;
  return props.map((p) => (p.key === key ? { ...p, value } : p));
};

export function useRenderSettings() {
  const [backend, setBackendState] = useState<RenderBackendId>(DEFAULT_RENDER_BACKEND);
  const [commonProps, setCommonProps] = useState<PropDef[]>(() =>
    cloneProps(RENDER_COMMON_PROPS),
  );
  const [backendProps, setBackendProps] = useState<PropDef[]>(() =>
    cloneProps(RENDER_BACKENDS[DEFAULT_RENDER_BACKEND].props),
  );
  const [preset, setPreset] = useState<string>(DEFAULT_RENDER_PRESET);

  /** Switch the active backend, keeping common settings, resetting backend ones. */
  const setBackend = useCallback((id: RenderBackendId) => {
    setBackendState(id);
    setBackendProps(cloneProps(RENDER_BACKENDS[id].props));
  }, []);

  /** Update a single setting value by key (common or backend-specific). */
  const handleChange = useCallback(
    (key: string, value: string | number | boolean) => {
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
      const sized = RENDER_SIZE_PRESETS.find((p) => p.label === label);
      if (!sized) return;

      let size: { width: number; height: number } | undefined;
      if (sized.dynamic) {
        size = dynamicSize;
      } else if (sized.width > 0) {
        size = { width: sized.width, height: sized.height };
      }
      if (!size) return;

      setCommonProps((prev) => {
        let next = applyChange(prev, "width", size.width);
        next = applyChange(next, "height", size.height);
        if (sized.dpi !== undefined) {
          next = applyChange(next, "dpi", sized.dpi);
        }
        return next;
      });
    },
    [],
  );

  /** Frozen copy of the current settings, used for a render result. */
  const getSnapshot = useCallback(
    (): RenderSettingsSnapshot => ({
      backend,
      commonProps: cloneProps(commonProps),
      backendProps: cloneProps(backendProps),
    }),
    [backend, commonProps, backendProps],
  );

  /** Load settings from a snapshot (used by "Re-render"). */
  const restore = useCallback((snapshot: RenderSettingsSnapshot) => {
    setBackendState(snapshot.backend);
    setCommonProps(cloneProps(snapshot.commonProps));
    setBackendProps(cloneProps(snapshot.backendProps));
    // Restored sizes are explicit, so no preset is active.
    setPreset(DEFAULT_RENDER_PRESET);
  }, []);

  return {
    backend,
    commonProps,
    backendProps,
    preset,
    setBackend,
    handleChange,
    applyPreset,
    getSnapshot,
    restore,
  } as const;
}
