/**
 * @file hooks/useRenderWindowClient.ts
 * @description Rendering-window side of the relay.
 *
 * Mirrors the render job / latest result / target-view list pushed by the
 * main window's useRenderWindowBridge, owns the render-target selection
 * (dropdown value), and exposes command senders (start, cancel,
 * show-source) plus the "Current view" canvas-size round trip.
 *
 * Target selection: the user picks any open molview from the pushed
 * `views` list. When the MAIN window's active molview CHANGES, the
 * selection auto-follows it (last event wins -- a later explicit pick
 * sticks until the next active-view change). A selection whose view was
 * closed falls back to the active view.
 *
 * On mount it subscribes to RENDER_WINDOW_STATE_PUSH FIRST and then sends a
 * 'sync' command -- that ordering guarantees the sync reply is not missed.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { IPC } from "../../shared/ipcChannels";
import type {
  RenderFramePreviewWire,
  RenderTargetViewWire,
  RenderWindowCommand,
  RenderWindowStateUpdate,
  RenderViewCamera,
  ViewSizePx,
} from "../../shared/ipcTypes";
import type { RenderJob } from "./useRenderJob";
import type {
  RenderResult,
  RenderSettingsSnapshot,
  RenderSource,
} from "../data/renderResult";

export interface RenderWindowClientState {
  /** Mirrored render job (progress/log), or null when idle. */
  job: RenderJob | null;
  /**
   * Completed renders, oldest first, as pushed by the main window. Metadata
   * only -- the images are archived on disk and read back one at a time
   * (see `shownImage`), so this stays cheap however long it grows.
   */
  history: RenderResult[];
  /** Index into `history` of the result on screen, or -1 when empty. */
  historyIndex: number;
  /** Most recent finished frame of a running movie render. */
  preview: RenderFramePreviewWire | null;
  /** Open molviews selectable as render targets. */
  views: RenderTargetViewWire[];
  /** The main window's active molview, or null. */
  activeViewId: number | null;
  /** Whether the umbreon render backend is compiled into this build. */
  umbreonAvailable: boolean;
}

const INITIAL_STATE: RenderWindowClientState = {
  job: null,
  history: [],
  historyIndex: -1,
  preview: null,
  views: [],
  activeViewId: null,
  umbreonAvailable: false,
};

/** Send a command toward the main window's bridge. */
function sendCommand(cmd: RenderWindowCommand): void {
  window.electronAPI?.invoke(IPC.RENDER_WINDOW_COMMAND, cmd).catch(() => {});
}

export function useRenderWindowClient(): {
  state: RenderWindowClientState;
  /** Selected render target, or null when no molview is open. */
  targetViewId: number | null;
  /** Explicitly select a render target (dropdown). */
  setTargetViewId: (viewId: number) => void;
  /** The selected target's descriptor, or null. */
  target: RenderTargetViewWire | null;
  /** Start a render of the selected target. */
  start: (snapshot: RenderSettingsSnapshot, source?: RenderSource) => void;
  /** Re-encode `frameCount` existing frames into a movie (no rendering). */
  encode: (snapshot: RenderSettingsSnapshot, frameCount: number) => void;
  /** Count the contiguous rendered frames on disk for the given output. */
  checkFrames: (outputDir: string, baseName: string) => Promise<number>;
  /** Delete the rendered frames and any encoded movie; resolves to true on success. */
  cleanupFrames: (outputDir: string, baseName: string) => Promise<boolean>;
  cancel: () => void;
  showSource: () => void;
  getViewSize: () => Promise<ViewSizePx | null>;
  /** The target view's camera settings, used to default the Camera group. */
  getViewCamera: (viewId: number) => Promise<RenderViewCamera | null>;
  /** The result currently on screen (a history entry), or null. */
  shownResult: RenderResult | null;
  /**
   * Its image, read back from the on-disk archive; null while loading or when
   * the file is gone (evicted, or lost with a crashed run).
   */
  shownImage: string | null;
  /** Show the previous / next render; returns the result now shown. */
  goBack: () => RenderResult | null;
  goForward: () => RenderResult | null;
} {
  const [state, setState] = useState<RenderWindowClientState>(INITIAL_STATE);
  // Mirrors `state` for the history navigation, which must resolve its entry
  // synchronously (see stepHistory).
  const stateRef = useRef(state);
  stateRef.current = state;
  const [targetViewId, setTargetViewIdState] = useState<number | null>(null);

  // The previously pushed activeViewId, to detect CHANGES (auto-follow
  // fires only on a change, so re-pushes of the same active view never
  // clobber an explicit selection).
  const prevActiveRef = useRef<number | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    // Subscribe before requesting the sync so the reply cannot be missed.
    const off = api.onPush(
      IPC.RENDER_WINDOW_STATE_PUSH,
      (update: RenderWindowStateUpdate) => {
        if (update.kind === "context") {
          const activeChanged = update.activeViewId !== prevActiveRef.current;
          prevActiveRef.current = update.activeViewId;
          setTargetViewIdState((current) => {
            // Auto-follow the main window's active view on change.
            if (activeChanged && update.activeViewId !== null) {
              return update.activeViewId;
            }
            // Selection gone (view closed) -> fall back to the active view.
            if (
              current !== null &&
              !update.views.some((v) => v.viewId === current)
            ) {
              return update.activeViewId;
            }
            // First push with no active view: default to the first target.
            if (current === null) {
              return update.activeViewId ?? update.views[0]?.viewId ?? null;
            }
            return current;
          });
          setState((prev) => ({
            ...prev,
            // Wire types are structural mirrors of the renderer types; cast
            // once at this boundary.
            job: update.job as RenderJob | null,
            views: update.views,
            activeViewId: update.activeViewId,
            umbreonAvailable: update.umbreonAvailable,
          }));
        } else if (update.kind === "history") {
          const history = update.entries as RenderResult[];
          setState((prev) => {
            // A re-sync re-pushes the list unchanged; only a genuinely newer
            // entry moves the view (that is what the user just rendered).
            const newest = history[history.length - 1]?.id;
            const wasNewest = prev.history[prev.history.length - 1]?.id;
            const grew = newest !== undefined && newest !== wasNewest;
            // Entries evicted past the limit shift the index; keep the shown
            // entry by id where it still exists.
            const shownId = prev.history[prev.historyIndex]?.id;
            const kept = history.findIndex((r) => r.id === shownId);
            return {
              ...prev,
              history,
              historyIndex: grew || kept < 0 ? history.length - 1 : kept,
              // A finished render supersedes the live preview.
              preview: null,
            };
          });
        } else {
          setState((prev) => ({ ...prev, preview: update.preview }));
        }
      },
    );
    sendCommand({ type: "sync" });
    return off;
  }, []);

  const setTargetViewId = useCallback((viewId: number) => {
    setTargetViewIdState(viewId);
  }, []);

  const target =
    state.views.find((v) => v.viewId === targetViewId) ?? null;
  const targetRef = useRef(target);
  targetRef.current = target;

  /** Start a render: explicit `source` (re-render) or the selected target. */
  const start = useCallback(
    (snapshot: RenderSettingsSnapshot, source?: RenderSource) => {
      const t = targetRef.current;
      const resolved =
        source ??
        (t
          ? { sceneId: t.sceneId, sceneName: t.sceneName, viewId: t.viewId }
          : undefined);
      sendCommand({ type: "start", snapshot, source: resolved });
    },
    [],
  );

  const encode = useCallback(
    (snapshot: RenderSettingsSnapshot, frameCount: number) => {
      const t = targetRef.current;
      const source = t
        ? { sceneId: t.sceneId, sceneName: t.sceneName, viewId: t.viewId }
        : undefined;
      sendCommand({ type: "start", snapshot, source, encodeOnly: { frameCount } });
    },
    [],
  );

  const checkFrames = useCallback(
    async (outputDir: string, baseName: string): Promise<number> => {
      const api = window.electronAPI;
      if (!api || !outputDir) return 0;
      try {
        const res = await api.invoke(IPC.RENDER_FRAMES_CHECK, { outputDir, baseName });
        return res?.frameCount ?? 0;
      } catch {
        return 0;
      }
    },
    [],
  );

  const cleanupFrames = useCallback(
    async (outputDir: string, baseName: string): Promise<boolean> => {
      const api = window.electronAPI;
      if (!api || !outputDir) return false;
      try {
        const res = await api.invoke(IPC.RENDER_FRAMES_CLEANUP, { outputDir, baseName });
        return res?.ok ?? false;
      } catch {
        return false;
      }
    },
    [],
  );

  const cancel = useCallback(() => sendCommand({ type: "cancel" }), []);
  const showSource = useCallback(() => sendCommand({ type: "show-source" }), []);

  /**
   * Step through the render history. Returns the result now on screen so the
   * caller can restore the settings that produced it, or null at the end.
   *
   * The entry is read from a ref rather than inside the state updater: the
   * updater does not run until React flushes, so a value captured there would
   * still be null when this returns.
   */
  const stepHistory = useCallback((delta: number): RenderResult | null => {
    const { history, historyIndex } = stateRef.current;
    const next = historyIndex + delta;
    if (next < 0 || next >= history.length) return null;
    setState((prev) => ({ ...prev, historyIndex: next, preview: null }));
    return history[next];
  }, []);

  const goBack = useCallback(() => stepHistory(-1), [stepHistory]);
  const goForward = useCallback(() => stepHistory(1), [stepHistory]);

  // Image of the entry on screen. Only this one is held in memory: the rest of
  // the history is metadata, and the archived PNGs are read back per entry.
  const shownResult = state.history[state.historyIndex] ?? null;
  const shownId = shownResult?.id ?? null;
  const [shownImage, setShownImage] = useState<string | null>(null);
  useEffect(() => {
    if (shownId === null) {
      setShownImage(null);
      return;
    }
    let cancelled = false;
    setShownImage(null);
    void window.electronAPI
      ?.invoke(IPC.RENDER_HISTORY_READ, { resultId: shownId })
      .then((res) => {
        if (!cancelled) setShownImage(res?.dataUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setShownImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shownId]);

  const getViewCamera = useCallback(
    async (viewId: number): Promise<RenderViewCamera | null> => {
      const api = window.electronAPI;
      if (!api) return null;
      try {
        return await api.invoke(IPC.RENDER_VIEW_CAMERA_GET, { viewId });
      } catch {
        return null;
      }
    },
    [],
  );

  const getViewSize = useCallback(async (): Promise<ViewSizePx | null> => {
    const api = window.electronAPI;
    if (!api) return null;
    try {
      return await api.invoke(IPC.RENDER_VIEW_SIZE_GET);
    } catch {
      return null;
    }
  }, []);

  return {
    state,
    targetViewId,
    setTargetViewId,
    target,
    start,
    encode,
    checkFrames,
    cleanupFrames,
    cancel,
    showSource,
    getViewSize,
    getViewCamera,
    shownResult,
    shownImage,
    goBack,
    goForward,
  };
}
