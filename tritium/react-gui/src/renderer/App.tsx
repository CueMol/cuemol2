/**
 * Root component of the CueMol desktop application.
 *
 * Layout: Toolbar / [ActivityBar | SidePanel | [ContentArea / BottomPanel] | InspectorPanel] / StatusBar
 *
 * Domain state lives in the providers under state/ (workspace, layout,
 * inspector, scene tree, ...); the panes and panels read it there. What is
 * left here is the layout itself and the window-level wiring:
 *   - useAppInitialization      -- first scene/view on launch (StrictMode guarded)
 *   - useCommandRegistrations   -- registers all CmdId handlers + Electron IPC bridge
 *   - useRenderWindowBridge     -- the modeless Rendering window's job lifecycle
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";

import { ActivityBar, type ActivityView } from "./components/ActivityBar";
import { MenuBar } from "./components/MenuBar";
import { Toolbar } from "./components/Toolbar";
import { SidePanel } from "./components/panels/SidePanel";
import { ContentArea } from "./components/ContentArea";
import { BottomPanel } from "./components/panels/BottomPanel";
import { StatusBar } from "./components/StatusBar";
import { InspectorPanel } from "./components/panels/InspectorPanel";

import { installSelectAllScope } from "./utils/selectAllScope";
import { installClipboardScopeTracking } from './utils/editClipboard';

import { useTextContextMenu } from "./hooks/useTextContextMenu";
import { IconContext } from "@phosphor-icons/react";
import { useRenderWindowBridge } from "./hooks/useRenderWindowBridge";
import { useCueMol } from "@renderer/hooks/cuemol/useCueMol";
import { useActiveScene, useWorkspaceDispatch, useWorkspaceTabs } from "./state/workspace";
import { useLayout, useLayoutDispatch } from "./state/layout";
import { useActiveViewValues } from "./state/activeView";
import { useInspector } from "./state/inspector";
import { useAppInitialization } from "./hooks/useAppInitialization";
import { useNewSceneAction } from "./hooks/useNewSceneAction";
import { useCommandRegistrations } from "./hooks/useCommandRegistrations";
import { useFileDrop } from "./hooks/useFileDrop";
import { useShellOpenFiles } from "./hooks/useShellOpenFiles";
import { FileDropOverlay } from "./components/FileDropOverlay";
import { IPC } from "@shared/ipcChannels";
import { useRenderConfig } from "./contexts/RenderConfigContext";
import { useWindowCloseHandler } from "./hooks/useWindowCloseHandler";
import { useWindowTitleSync } from "./hooks/useWindowTitleSync";

const App: React.FC = () => {

  // --- Persistent layout state (state/layout) ---
  // Sizes are read once, as loaded; a drag writes the store without a
  // re-render. Only the flags the UI renders from are reactive.
  const { loaded, inspectorOpen, savedSizes } = useLayout();
  const { setMainSizes, setRightPanelSizes, setCenterSizes, setInspectorOpen, flushPendingSaves } =
    useLayoutDispatch();

  // --- Activity-bar state ---

  const [activeView, setActiveView] = useState<ActivityView | null>("explorer");

  const handleActivitySelect = useCallback((view: ActivityView) => {
    setActiveView((prev) => (prev === view ? null : view));
  }, []);

  /**
   * Mirror a snap-driven collapse/reopen of the sidebar pane into
   * `activeView`, the source of truth for its controlled `visible` prop.
   *
   * Allotment's onVisibleChange cannot be used for this: it is only
   * emitted on drag end, but onChange re-renders the parent during the
   * drag and allotment's controlled-visible sync effect restores the pane
   * to the stale prop value first, so the drag-collapse never sticks and
   * onVisibleChange never fires (verified against allotment 1.20.2).
   * Instead detect the collapse from the sizes onChange reports: a
   * snapped-hidden pane has size 0, and a hidden pane can never report a
   * non-zero size (its maximumSize is 0 while hidden).
   */
  const handleMainSizesChange = useCallback(
    (sizes: number[]) => {
      setMainSizes(sizes);
      // All-zero sizes mean the container itself has no layout yet; that
      // must not be mistaken for a collapsed sidebar.
      if (sizes[0] === undefined || !sizes.some((s) => s > 0)) return;
      setActiveView((prev) => (sizes[0] > 0 ? (prev ?? "explorer") : null));
    },
    [setMainSizes],
  );

  // --- CueMol core / tabs ---

  const { cueMolReady, cm } = useCueMol();
  // The tab strip and the active scene it implies come from one provider
  // (state/workspace), so the scene and the view are never a render apart.
  const { activateTab, closeTab, tabsRef } = useWorkspaceDispatch();
  const { tabs, activeTabId: activeTab, molViewEntries } = useWorkspaceTabs();
  const { activeMolViewId } = useActiveScene();
  // The exporter probe (state/activeView) and whether the inspector has
  // anything to show (state/inspector).
  const { exportAvailable } = useActiveViewValues();
  const inspectorHasTarget = useInspector().target !== null;

  /**
   * Same snap-collapse mirroring as the sidebar (see
   * `handleMainSizesChange`) for the inspector pane. Only the open flag is
   * mirrored; the inspector target is kept so a drag-hide / drag-show
   * round trip restores the same content. The equality guard keeps the
   * per-drag-event onChange stream from re-persisting an unchanged flag.
   */
  const handleRightPanelSizesChange = useCallback(
    (sizes: number[]) => {
      setRightPanelSizes(sizes);
      if (sizes[1] === undefined || !sizes.some((s) => s > 0)) return;
      const wantOpen = sizes[1] > 0;
      if (wantOpen !== inspectorOpen) setInspectorOpen(wantOpen);
    },
    [setRightPanelSizes, inspectorOpen, setInspectorOpen],
  );

  // Persistent render binary paths (POV-Ray / blendpng) from SettingsPane.
  // Attached to render jobs started via the Rendering-window bridge.
  const { binaries: renderBinaries } = useRenderConfig();

  // Persist user-defined style defaults (atom labels, view-input scalars) to
  // the user style file when the window closes -- UXP `Qm2Main.onUnLoad`
  // parity. The path is resolved by Main via APP_PATH.
  const saveUserStyleOnClose = useCallback(async (): Promise<void> => {
    // Closing the window does not unmount the renderer, so the debounced
    // layout / UI writes have no other chance to land: dragging a splitter and
    // closing straight after used to lose the new layout.
    await flushPendingSaves();
    if (!cm) return;
    // Stop anything still running before the worker goes away with the window.
    // Renders and APBS runs are external processes (posix_spawn children of
    // this app), so they outlive it unless they are killed -- and their work
    // directory is only registered for cleanup on completion, so it would be
    // left behind too.
    try {
      const stopped = await cm.invokeService('cancelAllJobs', {});
      if (stopped.render > 0 || stopped.apbs > 0) {
        console.log(
          `[close] cancelled ${stopped.render} render / ${stopped.apbs} apbs job(s)`,
        );
      }
    } catch (err: unknown) {
      console.warn('cancelling in-flight jobs failed:', err);
    }
    const info = await window.electronAPI?.invoke(IPC.APP_PATH);
    const path = info?.userStylePath;
    if (path) await cm.saveUserStyle(path);
  }, [cm, flushPendingSaves]);

  useWindowCloseHandler({
    tabsRef,
    handleCloseTab: closeTab,
    setActiveTab: activateTab,
    onBeforeProceed: saveUserStyleOnClose,
  });

  // First scene/view on launch (StrictMode guarded); the same "create scene
  // + view + register tab" action the New Tab dialog uses.
  const newScene = useNewSceneAction({ cm });
  const { initialSceneSettled } = useAppInitialization({ cueMolReady, newScene });

  // --- Render: Rendering-window bridge ---

  // All render UI lives in the modeless Rendering window; this bridge owns
  // the job lifecycle (the CueMol worker exists only in this renderer),
  // executes commands relayed from that window, and pushes job / target
  // state back.

  // Renderable targets offered in the render window's Target dropdown. The
  // scene name is the tab title minus its ":<viewIdx>" suffix; the entries
  // are the strip's own records, so a rename is already reflected here.
  const renderTargetViews = useMemo(
    () =>
      molViewEntries.map((e) => ({
        viewId: e.view_id,
        sceneId: e.scene_uid,
        sceneName: e.title.replace(/:\d+$/, ""),
        title: e.title,
      })),
    [molViewEntries],
  );

  // Scene-exporter availability (probed by ActiveViewStateProvider); the
  // umbreon capability is forwarded to the modeless render window.
  const umbreonAvailable = exportAvailable?.includes("umbreon") ?? false;

  useRenderWindowBridge({
    cm,
    views: renderTargetViews,
    activeViewId: activeMolViewId,
    tabs,
    setActiveTab: activateTab,
    binaries: renderBinaries,
    umbreonAvailable,
  });

  // --- All command handlers + Electron IPC bridge ---
  useCommandRegistrations();

  // --- OS file drag-and-drop open (window-level, UXP dragdropopen parity) ---
  const { isDragActive } = useFileDrop({ cm });

  // --- OS shell / command-line file open (UXP openFromShell parity) ---
  useShellOpenFiles({ cm, cueMolReady, initialSceneSettled });

  // --- macOS traffic-light inset ---

  useEffect(() => {
    if (window.electronAPI?.platform === "darwin") {
      document.documentElement.style.setProperty("--titlebar-inset", "78px");
    }
  }, []);

  // --- Scoped Select All ---
  // Track the active selectable region so Cmd+A / Edit > Select All target only
  // the focused field or that region (e.g. the log panel), never the whole GUI.
  useEffect(() => installSelectAllScope(), []);

  // --- Clipboard scope tracking ---
  // Remember which panel the user last worked in, so Edit > Cut/Copy/Paste
  // reaches it even when the click moved focus into the menu itself.
  useEffect(() => installClipboardScopeTracking(), []);

  // --- Text clipboard context menu (Windows/Linux React menu path) ---
  useTextContextMenu();

  // --- OS window title follows the active scene (UXP setWindowTitle) ---
  useWindowTitleSync(tabs, activeTab);

  // --- Derived values ---

  const sidebarVisible = activeView !== null;

  // --- Render ---

  return (
    <>
    {/* Phosphor icon defaults: inherit text color (theme-aware), regular weight. */}
    <IconContext.Provider value={{ color: "currentColor", weight: "regular" }}>
    <div className="app">
      {window.electronAPI?.platform !== 'darwin' && (
        <MenuBar />
      )}
      <Toolbar />

      <div className="main-layout">
        <div className="main-layout-inner">
          <ActivityBar activeView={activeView} onSelect={handleActivitySelect} />

          <div className="main-content-area">
            {loaded && (
              <Allotment
                onChange={handleMainSizesChange}
                defaultSizes={
                  savedSizes.mainSizes.length > 0
                    ? savedSizes.mainSizes
                    : undefined
                }
              >
                {/* Left: Sidebar */}
                <Allotment.Pane
                  minSize={180}
                  preferredSize={260}
                  visible={sidebarVisible}
                  snap
                >
                  <SidePanel activeView={activeView ?? "explorer"} />
                </Allotment.Pane>

                {/* Right section: center + inspector */}
                <Allotment.Pane>
                  <Allotment
                    onChange={handleRightPanelSizesChange}
                    defaultSizes={
                      savedSizes.rightPanelSizes.length > 0
                        ? savedSizes.rightPanelSizes
                        : undefined
                    }
                  >
                    {/* Center: ContentArea + BottomPanel (vertical split) */}
                    <Allotment.Pane>
                      <Allotment
                        vertical
                        onChange={setCenterSizes}
                        defaultSizes={
                          savedSizes.centerSizes.length > 0
                            ? savedSizes.centerSizes
                            : undefined
                        }
                      >
                        <Allotment.Pane>
                          <ContentArea />
                        </Allotment.Pane>
                        <Allotment.Pane minSize={100} preferredSize={200} snap>
                          <BottomPanel />
                        </Allotment.Pane>
                      </Allotment>
                    </Allotment.Pane>

                    {/* Right: Inspector */}
                    {/* Collapse the pane whenever nothing is being inspected
                        (no target), even if the open flag is still set -- an
                        empty inspector shows no useful content, so it should not
                        take space. Selecting a node re-applies a target (via
                        applyTarget, which also re-opens) and the pane reappears. */}
                    <Allotment.Pane
                      minSize={240}
                      preferredSize={300}
                      visible={inspectorOpen && inspectorHasTarget}
                      snap
                    >
                      <InspectorPanel />
                    </Allotment.Pane>
                  </Allotment>
                </Allotment.Pane>
              </Allotment>
            )}
          </div>
        </div>
      </div>

      <StatusBar />

      {isDragActive && <FileDropOverlay />}
    </div>
    </IconContext.Provider>
    </>
  );
};

export default App;
