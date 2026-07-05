/**
 * @file hooks/useRenderWindowClient.ts
 * @description Rendering-window side of the relay.
 *
 * Mirrors the render job / latest result / renderability pushed by the main
 * window's useRenderWindowBridge, and exposes command senders (start,
 * cancel, show-source) plus the "Current view" canvas-size round trip.
 *
 * On mount it subscribes to RENDER_WINDOW_STATE_PUSH FIRST and then sends a
 * 'sync' command -- that ordering guarantees the sync reply is not missed.
 */

import { useState, useEffect, useCallback } from "react";
import { IPC } from "../../shared/ipcChannels";
import type {
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
  /** Whether the main window has a renderable (molview) tab active. */
  canRender: boolean;
  /** Active scene display name in the main window, or null. */
  sceneName: string | null;
}

const INITIAL_STATE: RenderWindowClientState = {
  job: null,
  result: null,
  canRender: false,
  sceneName: null,
};

/** Send a command toward the main window's bridge. */
function sendCommand(cmd: RenderWindowCommand): void {
  window.electronAPI?.invoke(IPC.RENDER_WINDOW_COMMAND, cmd).catch(() => {});
}

export function useRenderWindowClient(): {
  state: RenderWindowClientState;
  start: (snapshot: RenderSettingsSnapshot, source?: RenderSource) => void;
  cancel: () => void;
  showSource: () => void;
  getViewSize: () => Promise<ViewSizePx | null>;
} {
  const [state, setState] = useState<RenderWindowClientState>(INITIAL_STATE);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    // Subscribe before requesting the sync so the reply cannot be missed.
    const off = api.onPush(
      IPC.RENDER_WINDOW_STATE_PUSH,
      (update: RenderWindowStateUpdate) => {
        setState((prev) => {
          if (update.kind === "context") {
            // Wire types are structural mirrors of the renderer types; cast
            // once at this boundary.
            return {
              ...prev,
              job: update.job as RenderJob | null,
              canRender: update.canRender,
              sceneName: update.sceneName,
            };
          }
          return { ...prev, result: update.result as RenderResult | null };
        });
      },
    );
    sendCommand({ type: "sync" });
    return off;
  }, []);

  const start = useCallback(
    (snapshot: RenderSettingsSnapshot, source?: RenderSource) => {
      sendCommand({ type: "start", snapshot, source });
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

  return { state, start, cancel, showSource, getViewSize };
}
