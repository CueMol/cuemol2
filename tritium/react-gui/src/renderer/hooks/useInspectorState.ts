/**
 * @file hooks/useInspectorState.ts
 * @description Custom hook that manages the inspector panel lifecycle:
 * open/close state, the target node being inspected, and the property
 * data displayed inside the panel.
 *
 * In the real application the property definitions will be fetched
 * from the backend when a node is selected.  This hook currently
 * uses static sample data but provides the same public interface
 * the production code will use.
 */

import { useState, useCallback, useEffect } from "react";
import type { LayoutState } from "./useLayoutPersistence";

import {
  RIBBON_PROPERTIES,
  RIBBON_GENERIC_PROPERTIES,
  type PropDef,
  type GenericPropEntry,
} from "../data/rendererProperties";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/** Display information shown in the inspector header. */
export interface InspectorInfo {
  name: string;
  type: string;
}

export interface UseInspectorStateOptions {
  /** Persisted layout (used to restore open state on first load). */
  layout: LayoutState;
  /** Whether the persisted layout has finished loading. */
  loaded: boolean;
  /** Persist the inspector open/close flag to disk. */
  persistInspectorOpen: (open: boolean) => void;
  /**
   * Resolve a scene node ID into a display name and type string.
   * Provided by the scene-state hook.
   */
  resolveNodeName: (id: string) => string;
}

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

export function useInspectorState({
  layout,
  loaded,
  persistInspectorOpen,
  resolveNodeName,
}: UseInspectorStateOptions) {
  // ── Local state ──────────────────────────────────────────

  const [inspectorOpen, setInspectorOpenLocal] = useState(false);
  const [inspectorTarget, setInspectorTarget] = useState<string | null>(null);
  const [rendererProps, setRendererProps] = useState<PropDef[]>(RIBBON_PROPERTIES);
  const [genericProps, setGenericProps] = useState<GenericPropEntry[]>(RIBBON_GENERIC_PROPERTIES);

  // Restore open state from persisted layout on first load.
  useEffect(() => {
    if (loaded && layout.inspectorOpen) {
      setInspectorOpenLocal(true);
    }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────────────────

  /** Update both the local state and the persisted flag. */
  const setInspectorOpen = useCallback(
    (open: boolean) => {
      setInspectorOpenLocal(open);
      persistInspectorOpen(open);
    },
    [persistInspectorOpen],
  );

  // ── Public handlers ──────────────────────────────────────

  /**
   * Open the inspector for the given renderer / object ID.
   * In the real application this will fetch the matching property
   * set from the backend; here we always show the ribbon sample data.
   */
  const handleShowProperty = useCallback(
    (id: string) => {
      setInspectorTarget(id);
      setInspectorOpen(true);
    },
    [setInspectorOpen],
  );

  /** Close the inspector and clear the target. */
  const handleCloseInspector = useCallback(() => {
    setInspectorOpen(false);
    setInspectorTarget(null);
  }, [setInspectorOpen]);

  /** Update a single property value in the structured property list. */
  const handlePropertyChange = useCallback(
    (key: string, value: string | number | boolean) => {
      setRendererProps((prev) =>
        prev.map((p) => (p.key === key ? { ...p, value } : p)),
      );
    },
    [],
  );

  /** Update a single entry in the generic key-value list. */
  const handleGenericChange = useCallback(
    (key: string, value: string) => {
      setGenericProps((prev) =>
        prev.map((e) => (e.key === key ? { ...e, value } : e)),
      );
    },
    [],
  );

  /** Resolve inspector display info for the current target. */
  const inspectorInfo: InspectorInfo = (() => {
    if (!inspectorTarget) return { name: "unknown", type: "Renderer" };
    // TODO: In the real app, the type string should come from the backend.
    return { name: resolveNodeName(inspectorTarget), type: "Ribbon Renderer" };
  })();

  return {
    inspectorOpen,
    inspectorTarget,
    rendererProps,
    genericProps,
    inspectorInfo,
    handleShowProperty,
    handleCloseInspector,
    handlePropertyChange,
    handleGenericChange,
  } as const;
}
