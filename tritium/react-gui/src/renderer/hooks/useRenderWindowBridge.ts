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
import { RENDER_HISTORY_LIMIT } from "../../shared/renderHistory";
import type {
  RenderJobWire,
  RenderTargetViewWire,
  RenderViewCamera,
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

/**
 * Drop the live preview image from a job before it goes on a context push.
 * Those fire on every progress tick; the image travels on its own
 * `framePreview` update instead.
 */
function toJobWire(job: RenderJob | null): RenderJobWire | null {
  if (!job) return null;
  const { previewDataUrl, previewWidth, previewHeight, ...wire } = job;
  void previewDataUrl;
  void previewWidth;
  void previewHeight;
  return wire;
}

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
  /** Whether the umbreon backend is compiled in (forwarded to the render window). */
  umbreonAvailable: boolean;
}

/** Push a state update toward the render window (dropped if it is closed). */
function pushState(update: RenderWindowStateUpdate): void {
  window.electronAPI?.invoke(IPC.RENDER_WINDOW_STATE, update).catch(() => {});
}

export function useRenderWindowBridge(args: UseRenderWindowBridgeArgs): void {
  const { cm } = args;

  // Completed renders, oldest first. Owned here (not in the render window) so
  // the history survives that window closing, which is also how long the
  // archived image files live.
  const historyRef = useRef<RenderResult[]>([]);

  const handleComplete = useCallback((result: RenderResult, imagePath: string) => {
    // Archive first: the render window reads the image straight back by id, so
    // pushing before the copy lands would show an empty frame.
    const api = window.electronAPI;
    const stored = api
      ? api
          .invoke(IPC.RENDER_HISTORY_STORE, {
            resultId: result.id,
            sourcePath: imagePath,
          })
          .catch(() => ({ ok: false }))
      : Promise.resolve({ ok: false });
    void stored.then(() => {
      historyRef.current = [...historyRef.current, result].slice(
        -RENDER_HISTORY_LIMIT,
      );
      pushState({ kind: "history", entries: historyRef.current });
    });
  }, []);

  const renderJob = useRenderJob({ cm, onComplete: handleComplete });

  // Push the context (job + targets) whenever it changes. This also covers
  // progress ticks: useRenderJob replaces the job object per update.
  useEffect(() => {
    pushState({
      kind: "context",
      job: toJobWire(renderJob.job),
      views: args.views,
      activeViewId: args.activeViewId ?? null,
      umbreonAvailable: args.umbreonAvailable,
    });
  }, [renderJob.job, args.views, args.activeViewId, args.umbreonAvailable]);

  // Push the live frame preview separately, and only when the image actually
  // changed -- the worker already rate-limits it, and keeping it off the
  // context push stops a multi-KB image riding every progress tick.
  const lastPreviewRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const job = renderJob.job;
    const dataUrl = job?.previewDataUrl;
    if (dataUrl === lastPreviewRef.current) return;
    lastPreviewRef.current = dataUrl;
    pushState({
      kind: "framePreview",
      preview: dataUrl
        ? {
            dataUrl,
            width: job?.previewWidth ?? 0,
            height: job?.previewHeight ?? 0,
            frameIndex: job?.frameIndex ?? 0,
          }
        : null,
    });
  }, [renderJob.job]);

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
        // A re-encode needs no scene (it runs over frames already on disk);
        // stand in a placeholder source for the result display if none exists.
        if (!source && cmd.encodeOnly) {
          const movie = (cmd.snapshot as RenderSettingsSnapshot).movie;
          source = { sceneId: -1, sceneName: movie?.baseName || "Movie" };
        }
        if (!source) return;
        void rj.start({
          sceneId: source.sceneId,
          viewId: source.viewId,
          snapshot: cmd.snapshot as RenderSettingsSnapshot,
          source,
          binaries: a.binaries,
          ...(cmd.encodeOnly ? { encodeOnly: cmd.encodeOnly } : {}),
        });
        break;
      }
      case "cancel":
        void rj.cancel();
        break;
      case "show-source": {
        // The newest render is the one whose scene "Show source" means.
        const result = historyRef.current[historyRef.current.length - 1] ?? null;
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
          job: toJobWire(rj.job),
          views: a.views,
          activeViewId: a.activeViewId ?? null,
          umbreonAvailable: a.umbreonAvailable,
        });
        pushState({ kind: "history", entries: historyRef.current });
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
    // Camera settings of a render target view: the render window defaults its
    // Camera group to whatever the target view currently shows, and only this
    // window can read the view (the worker lives here).
    const offCamera = api.onPush(IPC.RENDER_VIEW_CAMERA_REQUEST, ({ reqId, viewId }) => {
      const reply = (camera: RenderViewCamera | null) =>
        api.invoke(IPC.RENDER_VIEW_CAMERA_REPLY, { reqId, camera }).catch(() => {});
      if (!cm) {
        reply(null);
        return;
      }
      cm.invokeService("getViewProjection", { viewId })
        .then((res) =>
          reply(res?.ok ? { perspective: res.perspective } : null),
        )
        .catch(() => reply(null));
    });
    return () => {
      offExec();
      offSize();
      offCamera();
    };
  }, [execCommand, cm]);
}
