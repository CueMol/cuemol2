/**
 * @file features/render/useRenderWindowBridge.ts
 * @description Main-window side of the Rendering-window relay.
 *
 * The modeless Rendering window has no CueMol worker, so this hook -- mounted
 * once in App -- owns the render job lifecycle (useRenderJob) and the latest
 * RenderResult, executes commands forwarded from the render window
 * (RENDER_WINDOW_EXEC), and pushes job / target-view state back
 * (RENDER_WINDOW_STATE). It also answers the relay questions -- the "Current
 * view" canvas size, a target view's camera, a hatch style spec, a scene's
 * stored render settings (RENDER_RELAY_REQUEST/REPLY) -- stores the render
 * window's settings on a scene ('write-settings'), and forwards the scene's
 * render-settings change events so the window follows an undo / redo.
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
import { IPC } from "@shared/ipcChannels";
import { RENDER_HISTORY_LIMIT } from "@shared/renderHistory";
import type { RenderJobWire, RenderTargetViewWire, RenderWindowCommand, RenderWindowStateUpdate } from "@shared/types/renderWindow";
import { useCueMolEventListener } from "@renderer/hooks/cuemol/useCueMolEventListener";
import { SEM_ANY, SEM_CHANGED, SEM_SCENE } from "@renderer/event";
import { EVENT_BURST_DEBOUNCE_MS } from "@renderer/utils/timing";
import type { AsyncCueMol } from "@renderer/worker/client/AsyncCueMol";
import type { RenderBinaries } from "@renderer/worker/shared/renderTypes";
import type {
  RenderResult,
  RenderSettingsSnapshot,
  RenderSource,
} from "@renderer/data/renderResult";
import { useRenderJob, type RenderJob } from "./useRenderJob";
import { useWindowRelayResponder } from "./useWindowRelayResponder";
import type { TabData } from "@renderer/types";
import { MOLVIEW_CANVAS_SELECTOR } from '@renderer/features/molview/molViewCanvas';

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
  /**
   * Undo / redo a scene's last edit on the render window's behalf (its Cmd+Z).
   * Owned by the caller so the active scene goes through the main window's
   * own Undo command and its toolbar / menu state stays in step.
   */
  onEditScene?: (action: "undo" | "redo", sceneId: number) => void;
}

/** Push a state update toward the render window (dropped if it is closed). */
function pushState(update: RenderWindowStateUpdate): void {
  window.electronAPI?.invoke(IPC.RENDER_WINDOW_STATE, update).catch(() => {});
}

/** Scene app-data id of the stored render settings (see the worker service). */
const RENDER_APP_DATA_ID = "render";

/** The subset of the CueMol event payload the app-data listener reads. */
interface CueMolEventArgs {
  srcUID?: number;
  obj?: { descr?: string; target_uid?: number };
}

export function useRenderWindowBridge(args: UseRenderWindowBridgeArgs): void {
  const { cm } = args;

  // Completed renders, oldest first. Owned here (not in the render window) so
  // the history survives that window closing, which is also how long the
  // archived image files live.
  const historyRef = useRef<RenderResult[]>([]);

  const handleComplete = useCallback(
    (result: RenderResult, image: { path: string; workDir?: string }) => {
    // Archive first: the render window reads the image straight back by id, so
    // pushing before the copy lands would show an empty frame.
      const api = window.electronAPI;
      const stored = api
        ? api
            .invoke(IPC.RENDER_HISTORY_STORE, {
              resultId: result.id,
              sourcePath: image.path,
              ...(image.workDir ? { workDir: image.workDir } : {}),
            })
            .catch(() => ({ ok: false }))
        : Promise.resolve({ ok: false });
      void stored.then((res) => {
        // Only publish an entry the archive actually holds. A failed store
        // still produced a history row whose RENDER_HISTORY_READ returns null
        // -- a blank frame in the render window, and "no longer available" from
        // Save Image -- and left the render's work directory unregistered, so
        // nothing ever reclaimed it.
        if (!res?.ok) {
          console.warn("render history store failed; entry not published:", result.id);
          return;
        }
        historyRef.current = [...historyRef.current, result].slice(
          -RENDER_HISTORY_LIMIT,
        );
        pushState({ kind: "history", entries: historyRef.current });
      });
    },
    [],
  );

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
      case "write-settings": {
        // No push back: the scene's own change event (below) tells the render
        // window what the scene now holds, the same way it learns of an undo.
        if (!a.cm) return;
        void a.cm
          .invokeService("setSceneRenderSettings", { sceneId: cmd.sceneId, values: cmd.values })
          .then((res) => {
            if (!res?.ok) console.warn("setSceneRenderSettings failed:", res?.error);
          })
          .catch((e: unknown) => console.warn("setSceneRenderSettings failed:", e));
        break;
      }
      case "edit":
        a.onEditScene?.(cmd.action, cmd.sceneId);
        break;
      case "clear-history":
        historyRef.current = [];
        pushState({ kind: "history", entries: [] });
        window.electronAPI?.invoke(IPC.RENDER_HISTORY_CLEAR).catch(() => {});
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
    return offExec;
  }, [execCommand]);

  // A scene's stored render settings changed: by the render window's own
  // write, an undo / redo here, or a script. Re-read and push; the render
  // window decides whether its editor has to follow. Any scene, not only the
  // active one -- the render target is the window's pick. C++ fires one event
  // per property, hence the burst debounce.
  useCueMolEventListener({
    cm,
    enabled: cm !== null,
    category: "sceneAppDataChanged",
    srcMask: SEM_SCENE,
    evtMask: SEM_CHANGED,
    scopeId: SEM_ANY,
    filter: (raw) => (raw as CueMolEventArgs).obj?.descr === RENDER_APP_DATA_ID,
    debounceMs: EVENT_BURST_DEBOUNCE_MS,
    handler: (raw) => {
      const a = raw as CueMolEventArgs;
      const sceneId = a.obj?.target_uid ?? a.srcUID;
      if (typeof sceneId !== "number" || !cm) return;
      void cm
        .invokeService("getSceneRenderSettings", { sceneId })
        .then((res) => {
          if (res?.ok) {
            pushState({
              kind: "sceneSettings",
              sceneId,
              exists: res.exists,
              values: res.values,
              defaults: res.defaults,
            });
          }
        })
        .catch(() => {});
    },
  });

  // The three questions the render window sends back over the relay. Each
  // answers with its own "cannot answer" value rather than staying silent, so
  // the render window learns the outcome without waiting out the timeout.
  useWindowRelayResponder({
    // Molview canvas pixel size ("Current view" preset).
    viewSize: () => {
      const canvas = document.querySelector(MOLVIEW_CANVAS_SELECTOR);
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      return width > 0 && height > 0 ? { width, height } : null;
    },
    // Camera settings of a render target view: the render window defaults its
    // Camera group to whatever the target view currently shows, and only this
    // window can read the view (the worker lives here).
    viewCamera: async ({ viewId }) => {
      if (!cm) return null;
      try {
        const res = await cm.invokeService("getViewProjection", { viewId });
        return res?.ok ? { perspective: res.perspective } : null;
      } catch {
        return null;
      }
    },
    // Hatch style template for the render window's NPR layer editor: resolve
    // the style name through the worker (the C++ umbreon exporter).
    hatchStyle: async ({ style }) => {
      if (!cm) return { ok: false, error: "no worker" };
      try {
        return (
          (await cm.invokeService("getHatchStyleSpec", { style })) ?? {
            ok: false,
            error: "no reply",
          }
        );
      } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    // The render settings a scene stores, for the editor to show when the
    // render target changes.
    sceneRenderSettings: async ({ sceneId }) => {
      if (!cm) return { ok: false, error: "no worker" };
      try {
        return (
          (await cm.invokeService("getSceneRenderSettings", { sceneId })) ?? {
            ok: false,
            error: "no reply",
          }
        );
      } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

