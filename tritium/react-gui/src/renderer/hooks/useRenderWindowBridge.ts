/**
 * @file hooks/useRenderWindowBridge.ts
 * @description Main-window side of the Rendering-window relay.
 *
 * The modeless Rendering window has no CueMol worker, so this hook -- mounted
 * once in App -- owns the render job lifecycle (useRenderJob) and the latest
 * RenderResult, executes commands forwarded from the render window
 * (RENDER_WINDOW_EXEC), and pushes job/result state back
 * (RENDER_WINDOW_STATE). It also answers the "Current view" canvas-size
 * round trip (RENDER_VIEW_SIZE_REQUEST/REPLY).
 *
 * State forwards are dropped by main while the render window is closed; the
 * window re-syncs via the 'sync' command on mount, which re-pushes both the
 * context and the latest result.
 */

import { useCallback, useEffect, useRef } from "react";
import { IPC } from "../../shared/ipcChannels";
import type {
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
import { useRenderJob, type RenderJob } from "./useRenderJob";
import type { TabData } from "../types";

interface UseRenderWindowBridgeArgs {
  cm: AsyncCueMol | null;
  /** Active molview tab's view id (undefined when a non-molview tab is active). */
  activeMolViewId: number | undefined;
  /** Active scene display name (scene.tree?.name), or null. */
  sceneName: string | null;
  /** Resolve the active scene/view ids (from useMolTabDispatch). */
  getActiveSceneInfo: () => { scene_uid: number; view_id: number } | null | undefined;
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

export function useRenderWindowBridge(args: UseRenderWindowBridgeArgs): {
  /** Current render job (for the main-window StatusBar progress line). */
  job: RenderJob | null;
} {
  const { cm } = args;

  // Latest completed render; survives render-window close/reopen.
  const latestResultRef = useRef<RenderResult | null>(null);

  const handleComplete = useCallback((result: RenderResult) => {
    latestResultRef.current = result;
    pushState({ kind: "result", result });
  }, []);

  const renderJob = useRenderJob({ cm, onComplete: handleComplete });

  const canRender = args.activeMolViewId !== undefined;

  // Push the context (job + renderability) whenever it changes. This also
  // covers progress ticks: useRenderJob replaces the job object per update.
  useEffect(() => {
    pushState({
      kind: "context",
      job: renderJob.job,
      canRender,
      sceneName: args.sceneName,
    });
  }, [renderJob.job, canRender, args.sceneName]);

  // --- Command execution (EXEC push from main) ---
  //
  // Subscribed once; reads fresh state through refs (ref-capture pattern) so
  // the IPC subscription is not torn down on every render.

  const stateRef = useRef({ args, renderJob, canRender });
  stateRef.current = { args, renderJob, canRender };

  const execCommand = useCallback((cmd: RenderWindowCommand) => {
    const { args: a, renderJob: rj, canRender: cr } = stateRef.current;
    switch (cmd.type) {
      case "start": {
        // Explicit source = re-render of a previous result; otherwise render
        // the active molview scene/view.
        let source: RenderSource | null = (cmd.source as RenderSource) ?? null;
        if (!source) {
          const info = a.getActiveSceneInfo();
          if (info) {
            source = {
              sceneId: info.scene_uid,
              sceneName: a.sceneName ?? `Scene ${info.scene_uid}`,
              viewId: info.view_id,
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
          canRender: cr,
          sceneName: a.sceneName,
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

  return { job: renderJob.job };
}
