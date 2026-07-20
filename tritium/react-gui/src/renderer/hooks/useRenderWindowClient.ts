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
  /** Latest completed render, or null when nothing has been rendered. */
  result: RenderResult | null;
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
  result: null,
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
  cancel: () => void;
  showSource: () => void;
  getViewSize: () => Promise<ViewSizePx | null>;
} {
  const [state, setState] = useState<RenderWindowClientState>(INITIAL_STATE);
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
        } else if (update.kind === "result") {
          setState((prev) => ({
            ...prev,
            result: update.result as RenderResult | null,
            // A finished render supersedes the live preview.
            preview: null,
          }));
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

  const cancel = useCallback(() => sendCommand({ type: "cancel" }), []);
  const showSource = useCallback(() => sendCommand({ type: "show-source" }), []);

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
    cancel,
    showSource,
    getViewSize,
  };
}
