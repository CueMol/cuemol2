/**
 * @file hooks/useRenderWindowBridge.ts
 * @description Main-window side of the Rendering-window relay.
 *
 * The modeless Rendering window has no CueMol worker, so this hook -- mounted
 * once in App -- owns the render job lifecycle (useRenderJob) and the latest
 * RenderResult, executes commands forwarded from the render window
 * (RENDER_WINDOW_EXEC), and pushes job / target-view state back
 * (RENDER_WINDOW_STATE). It also answers the "Current view" canvas-size
 * round trip (RENDER_VIEW_SIZE_REQUEST/REPLY).
 *
 * The render window picks its render target from the pushed `views` list
 * (auto-following the main window's active view) and sends it as the start
 * command's explicit `source`; the active view here is only a fallback.
 *
 * State forwards are dropped by main while the render window is closed; the
 * window re-syncs via the 'sync' command on mount, which re-pushes both the
 * context and the latest result.
 */

import { useCallback, useEffect, useRef } from "react";
import { IPC } from "../../shared/ipcChannels";
import type {
  RenderTargetViewWire,
  RenderWindowCommand,
  RenderWindowStateUpdate,
  ViewSizePx,
} from "../../shared/ipcTypes";
import type { AsyncCueMol } from "../worker/client/AsyncCueMol";
import type { RenderBinaries } from "../worker/shared/renderTypes";
import type {
  RenderResult,
  RenderSettingsSnapshot,
  RenderSource,
} from "../data/renderResult";
import { useRenderJob } from "./useRenderJob";
import type { TabData } from "../types";

interface UseRenderWindowBridgeArgs {
  cm: AsyncCueMol | null;
  /** Open molviews selectable as render targets (from molTabEntries). */
  views: RenderTargetViewWire[];
  /** Active molview tab's view id (undefined when a non-molview tab is active). */
  activeViewId: number | undefined;
  /** Open tabs -- used to locate the source molview tab for 'show-source'. */
  tabs: TabData[];
  setActiveTab: (id: string) => void;
  /** Render binary paths (from useRenderConfig; main window is the source). */
  binaries: RenderBinaries;
}

/** Push a state update toward the render window (dropped if it is closed). */
function pushState(update: RenderWindowStateUpdate): void {
  window.electronAPI?.invoke(IPC.RENDER_WINDOW_STATE, update).catch(() => {});
}

export function useRenderWindowBridge(args: UseRenderWindowBridgeArgs): void {
  const { cm } = args;

  // Latest completed render; survives render-window close/reopen.
  const latestResultRef = useRef<RenderResult | null>(null);

  const handleComplete = useCallback((result: RenderResult) => {
    latestResultRef.current = result;
    pushState({ kind: "result", result });
  }, []);

  const renderJob = useRenderJob({ cm, onComplete: handleComplete });

  // Push the context (job + targets) whenever it changes. This also covers
  // progress ticks: useRenderJob replaces the job object per update.
  useEffect(() => {
    pushState({
      kind: "context",
      job: renderJob.job,
      views: args.views,
      activeViewId: args.activeViewId ?? null,
    });
  }, [renderJob.job, args.views, args.activeViewId]);

  // --- Command execution (EXEC push from main) ---
  //
  // Subscribed once; reads fresh state through refs (ref-capture pattern) so
  // the IPC subscription is not torn down on every render.

  const stateRef = useRef({ args, renderJob });
  stateRef.current = { args, renderJob };

  const execCommand = useCallback((cmd: RenderWindowCommand) => {
    const { args: a, renderJob: rj } = stateRef.current;
    switch (cmd.type) {
      case "start": {
        // The render window sends its selected target as `source`; fall back
        // to the active molview if it is missing.
        let source: RenderSource | null = (cmd.source as RenderSource) ?? null;
        if (!source) {
          const active = a.views.find((v) => v.viewId === a.activeViewId);
          if (active) {
            source = {
              sceneId: active.sceneId,
              sceneName: active.sceneName,
              viewId: active.viewId,
            };
          }
        }
        if (!source) return;
        void rj.start({
          sceneId: source.sceneId,
          viewId: source.viewId,
          snapshot: cmd.snapshot as RenderSettingsSnapshot,
          source,
          binaries: a.binaries,
        });
        break;
      }
      case "cancel":
        void rj.cancel();
        break;
      case "show-source": {
        const result = latestResultRef.current;
        if (!result || result.sourceViewId === undefined) return;
        const tab = a.tabs.find(
          (t) => t.type === "molview" && t.viewId === result.sourceViewId,
        );
        if (tab) a.setActiveTab(tab.id);
        break;
      }
      case "sync":
        pushState({
          kind: "context",
          job: rj.job,
          views: a.views,
          activeViewId: a.activeViewId ?? null,
        });
        pushState({ kind: "result", result: latestResultRef.current });
        break;
    }
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const offExec = api.onPush(IPC.RENDER_WINDOW_EXEC, execCommand);
    const offSize = api.onPush(IPC.RENDER_VIEW_SIZE_REQUEST, ({ reqId }) => {
      // Resolve the molview canvas pixel size ("Current view" preset).
      let size: ViewSizePx | null = null;
      const canvas = document.querySelector("canvas");
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.round(rect.width * dpr);
        const height = Math.round(rect.height * dpr);
        if (width > 0 && height > 0) size = { width, height };
      }
      api.invoke(IPC.RENDER_VIEW_SIZE_REPLY, { reqId, size }).catch(() => {});
    });
    return () => {
      offExec();
      offSize();
    };
  }, [execCommand]);
}
