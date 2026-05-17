/**
 * @file hooks/useRenderSettings.ts
 * @description Holds the (non-persistent) render-settings editing state
 * shown in the Inspector `renderSettings` target.
 *
 * Settings are split into a backend-independent set and the active
 * backend's own set. Switching backend keeps the common settings and
 * swaps in the new backend's defaults. Phase 1 keeps a single in-memory
 * set; per-scene state is deferred to a later phase.
 */

import { useState, useCallback } from "react";
import type { PropDef } from "../data/rendererProperties";
import { RENDER_COMMON_PROPS, type RenderBackendId } from "../data/renderSettings";
import { RENDER_BACKENDS, DEFAULT_RENDER_BACKEND } from "../data/renderBackends";

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
    },
    [],
  );

  return { backend, commonProps, backendProps, setBackend, handleChange } as const;
}
