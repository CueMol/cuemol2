/**
 * @file hooks/useLayoutPersistence.ts
 * @description Custom hook that manages persistent layout state (splitter
 * positions, panel open/close) across application restarts.
 *
 * On mount it loads saved state from the Electron main process via IPC.
 * Whenever the caller updates a value, the hook debounces the write so
 * that rapid resize drags don't cause excessive disk I/O.
 *
 * In a plain browser environment (no Electron) the hook is a harmless
 * no-op that returns sensible defaults.
 *
 * ## Persisted layout keys
 *
 * | Key                | Description                                    |
 * |--------------------|------------------------------------------------|
 * | `mainSizes`        | Outer horizontal split: [sidebar, rightArea]   |
 * | `rightPanelSizes`  | Inner horizontal split: [center, inspector]    |
 * | `centerSizes`      | Vertical split: [editor, logPanel]             |
 * | `sidebarOpen`      | Whether the left sidebar is visible            |
 * | `inspectorOpen`    | Whether the right inspector panel is visible   |
 * | `viewSizes`        | Per-view splitter sizes (N panes per view)     |
 * | `viewCollapsed`    | Per-view collapse state (N panes per view)     |
 *
 * Note: The activity-bar active view is intentionally NOT persisted;
 * the app always starts with the Explorer view open.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/** Collapse state for sidebar sub-panels, keyed by pane id. */
export type PaneCollapseState = Record<string, boolean>;

export interface LayoutState {
  /** Outer horizontal split: [sidebar, rightArea]. */
  mainSizes?: number[];
  /** Inner horizontal split: [center, inspector]. */
  rightPanelSizes?: number[];
  centerSizes?: number[];
  sidebarOpen?: boolean;
  inspectorOpen?: boolean;

  /**
   * Per-view splitter sizes (supports N views × M panes).
   * e.g. `{ explorer: [220, 240], selection: [260, 180] }`
   */
  viewSizes?: Record<string, number[]>;

  /**
   * Per-view collapse flags (supports N views × M panes).
   * e.g. `{ explorer: { scene: false, color: false }, … }`
   */
  viewCollapsed?: Record<string, PaneCollapseState>;
}

export interface UiState {
  sidebarActiveView?: string;
  selectionMolId?: string;
}

/** Default layout values used on first run (no saved state). */
const LAYOUT_DEFAULTS: Required<LayoutState> = {
  mainSizes: [],
  rightPanelSizes: [],
  centerSizes: [],
  sidebarOpen: true,
  inspectorOpen: false,
  viewSizes: {
    explorer: [220, 240],
    selection: [260, 180],
  },
  viewCollapsed: {
    explorer: { scene: false, color: false },
    selection: { mol: false, selection: false },
  },
};

const UI_DEFAULTS: Required<UiState> = {
  sidebarActiveView: "explorer",
  selectionMolId: "",
};

/** Debounce interval for persisting layout changes (ms). */
const SAVE_DEBOUNCE_MS = 400;

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

export function useLayoutPersistence() {
  const [layout, setLayout] = useState<LayoutState>(LAYOUT_DEFAULTS);
  const [ui, setUi] = useState<UiState>(UI_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  /* Mutable refs so the debounced writer always gets the latest state. */
  const layoutRef = useRef<LayoutState>(layout);
  layoutRef.current = layout;

  const uiRef = useRef<UiState>(ui);
  uiRef.current = ui;

  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load on mount ────────────────────────────────────────
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setLoaded(true);
      return;
    }

    Promise.all([api.loadLayout(), api.loadUi()]).then(([savedLayout, savedUi]) => {
      if (savedLayout) setLayout((prev) => ({ ...prev, ...savedLayout }));
      if (savedUi) setUi((prev) => ({ ...prev, ...savedUi }));
      setLoaded(true);
    });
  }, []);

  // ── Debounced save helpers ───────────────────────────────
  const scheduleLayoutSave = useCallback(() => {
    const api = window.electronAPI;
    if (!api) return;
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    layoutTimerRef.current = setTimeout(() => {
      api.saveLayout(layoutRef.current);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const scheduleUiSave = useCallback(() => {
    const api = window.electronAPI;
    if (!api) return;
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => {
      api.saveUi(uiRef.current);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // ── Layout updaters (each triggers a debounced persist) ──

  const setMainSizes = useCallback(
    (sizes: number[]) => {
      setLayout((prev) => ({ ...prev, mainSizes: sizes }));
      scheduleLayoutSave();
    },
    [scheduleLayoutSave],
  );

  /** Persist the inner horizontal split (center + inspector). */
  const setRightPanelSizes = useCallback(
    (sizes: number[]) => {
      setLayout((prev) => ({ ...prev, rightPanelSizes: sizes }));
      scheduleLayoutSave();
    },
    [scheduleLayoutSave],
  );

  const setCenterSizes = useCallback(
    (sizes: number[]) => {
      setLayout((prev) => ({ ...prev, centerSizes: sizes }));
      scheduleLayoutSave();
    },
    [scheduleLayoutSave],
  );

  const setSidebarOpen = useCallback(
    (open: boolean) => {
      setLayout((prev) => ({ ...prev, sidebarOpen: open }));
      scheduleLayoutSave();
    },
    [scheduleLayoutSave],
  );

  const setInspectorOpen = useCallback(
    (open: boolean) => {
      setLayout((prev) => ({ ...prev, inspectorOpen: open }));
      scheduleLayoutSave();
    },
    [scheduleLayoutSave],
  );

  // ── Generic per-view updaters ────────────────────────────

  /**
   * Update the splitter sizes for a single view.
   * Merges into the `viewSizes` map without touching other views.
   */
  const setViewSizes = useCallback(
    (view: string, sizes: number[]) => {
      setLayout((prev) => ({
        ...prev,
        viewSizes: { ...prev.viewSizes, [view]: sizes },
      }));
      scheduleLayoutSave();
    },
    [scheduleLayoutSave],
  );

  /**
   * Update the collapse state for a single view.
   * Merges into the `viewCollapsed` map without touching other views.
   */
  const setViewCollapsed = useCallback(
    (view: string, collapsed: PaneCollapseState) => {
      setLayout((prev) => ({
        ...prev,
        viewCollapsed: { ...prev.viewCollapsed, [view]: collapsed },
      }));
      scheduleLayoutSave();
    },
    [scheduleLayoutSave],
  );

  // ── UI preference updaters ───────────────────────────────

  const setSidebarActiveView = useCallback(
    (view: string) => {
      setUi((prev) => ({ ...prev, sidebarActiveView: view }));
      scheduleUiSave();
    },
    [scheduleUiSave],
  );

  const setSelectionMolId = useCallback(
    (molId: string) => {
      setUi((prev) => ({ ...prev, selectionMolId: molId }));
      scheduleUiSave();
    },
    [scheduleUiSave],
  );

  // ── Flush pending saves on unmount ───────────────────────
  useEffect(() => {
    return () => {
      if (layoutTimerRef.current) {
        clearTimeout(layoutTimerRef.current);
        window.electronAPI?.saveLayout(layoutRef.current);
      }
      if (uiTimerRef.current) {
        clearTimeout(uiTimerRef.current);
        window.electronAPI?.saveUi(uiRef.current);
      }
    };
  }, []);

  return {
    // State
    layout,
    ui,
    loaded,
    // Layout setters
    setMainSizes,
    setRightPanelSizes,
    setCenterSizes,
    setSidebarOpen,
    setInspectorOpen,
    // Generic per-view setters
    setViewSizes,
    setViewCollapsed,
    // UI preference setters
    setSidebarActiveView,
    setSelectionMolId,
  };
}
