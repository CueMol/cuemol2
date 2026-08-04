/**
 * Root component of the CueMol desktop application.
 *
 * Layout: Toolbar / [ActivityBar | SidePanel | [ContentArea / BottomPanel] | InspectorPanel] / StatusBar
 *
 * Most domain wiring lives in extracted hooks:
 *   - useAppInitialization      -- first scene/view on launch (StrictMode guarded)
 *   - useActiveViewState        -- viewProjection / centerMark / bgColor cache + menu sync
 *   - useCommandRegistrations   -- registers all CmdId handlers + Electron IPC bridge
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

import { useLayoutPersistence } from "./hooks/useLayoutPersistence";
import { useTextContextMenu } from "./hooks/useTextContextMenu";
import { useInputDeviceStatus } from "./hooks/useInputDeviceStatus";
import { useActiveTool } from "./hooks/useActiveTool";
import { ActiveToolProvider } from "./contexts/ActiveToolContext";
import { IconContext } from "@phosphor-icons/react";
import { useSceneTree } from "./hooks/useSceneTree";
import { useSceneTreeController } from "./hooks/useSceneTreeController";
import { useInspectorState } from "./hooks/useInspectorState";
import { useRenderWindowBridge } from "./hooks/useRenderWindowBridge";
import { useTabManager } from "./hooks/useTabManager";
import { useCueMol } from "./hooks/useCueMol";
import { useMolTabDispatch, useMolTabState } from "./hooks/useMolTab";
import { useAppInitialization } from "./hooks/useAppInitialization";
import { useNewSceneAction } from "./hooks/useNewSceneAction";
import { useMolViewTabTitleSync } from "./hooks/useMolViewTabTitleSync";
import { useActiveViewState } from "./hooks/useActiveViewState";
import { useSceneExportCaps } from "./hooks/useSceneExportCaps";
import { useUndoRedoState } from "./hooks/useUndoRedoState";
import { useCommandRegistrations } from "./hooks/useCommandRegistrations";
import { useRecentFiles } from "./hooks/useRecentFiles";
import { useCommands } from "./commands/CommandRegistry";
import { CmdId } from "./commands/ids";
import type { ViewCenterMark } from "../shared/ipcTypes";
import { IPC } from "../shared/ipcChannels";
import { useCueMolBusy } from "./hooks/useCueMolBusy";
import { useShowConfirmCloseTabDialog } from "./components/dialogs/ConfirmCloseTabDialogProvider";
import { useRenderConfig } from "./contexts/RenderConfigContext";
import { useWindowCloseHandler } from "./hooks/useWindowCloseHandler";

const App: React.FC = () => {

  // --- Active tool state ---

  const { activeTool, activeDef, setActiveTool } = useActiveTool();

  // --- Persistent layout state ---

  const {
    layout,
    loaded,
    setMainSizes,
    setRightPanelSizes,
    setCenterSizes,
    setInspectorOpen: persistInspectorOpen,
    setViewSizes,
    setViewCollapsed,
  } = useLayoutPersistence();

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

  // --- CueMol core / tabs (cm needed early for useSceneTree) ---

  const { cueMolReady, cm } = useCueMol();
  const { addMolTab, removeMolTab, getActiveSceneInfo, setActiveViewByID, clearActiveView } = useMolTabDispatch();
  const { molTabEntries } = useMolTabState();
  const activeSceneId = molTabEntries.find((t) => t.active)?.scene_uid;

  // --- Domain hooks ---

  const scene = useSceneTree({ cm, sceneId: activeSceneId });

  const {
    inspectorOpen,
    inspectorTarget,
    inspectorCategory,
    genericEntries,
    genericLoading,
    inspectorInfo,
    handleShowGeneric,
    handleShowViewProps,
    handleShowAnimElement,
    handleClearAnimElement,
    handleCloseInspector,
    setInspectorOpen,
    handleGenericSet,
    handleGenericReset,
    handleSetMany,
    handleResetMany,
  } = useInspectorState({
    layout,
    loaded,
    persistInspectorOpen,
    cm,
    sceneTree: scene.tree,
    activeSceneId,
  });

  // Animation-element inspector header (name/type). App owns it because
  // tab-switch restore rewrites inspectorTarget without going through the
  // AnimationPanel, so the inspector's own fetch is the single source.
  const [animHeader, setAnimHeader] = useState<{ name: string; type: string } | null>(null);

  const handleInspectAnimElement = useCallback(
    (sceneId: number, uid: number | null) => {
      if (uid === null) {
        handleClearAnimElement(sceneId);
        setAnimHeader(null);
        return;
      }
      handleShowAnimElement(sceneId, uid);
    },
    [handleClearAnimElement, handleShowAnimElement],
  );
  const handleAnimHeaderChange = useCallback((name: string, type: string) => {
    setAnimHeader({ name, type });
  }, []);
  const handleAnimElementGone = useCallback(
    (sceneId: number) => {
      handleClearAnimElement(sceneId);
      setAnimHeader(null);
    },
    [handleClearAnimElement],
  );
  const handleCloseInspectorWithAnim = useCallback(() => {
    handleCloseInspector();
    setAnimHeader(null);
  }, [handleCloseInspector]);

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

  // --- CueMol core / tabs ---

  const showConfirmCloseTabDialog = useShowConfirmCloseTabDialog();
  const { dispatch: dispatchCommand } = useCommands();

  const handleMolViewClose = useCallback((viewId: number) => {
    removeMolTab(viewId);
    if (cm) {
      cm.removeView(viewId).catch((err: unknown) => {
        console.warn('removeView failed:', err);
      });
    }
  }, [cm, removeMolTab]);

  /**
   * Decide whether a molview tab may close, prompting to save when it is
   * the last view of a modified scene. Returns true to proceed with the
   * close, false to abort it.
   */
  const confirmCloseTab = useCallback(async (viewId: number): Promise<boolean> => {
    if (!cm) return true;
    const info = await cm.invokeService('getSceneCloseInfo', { viewId });
    if (!info?.ok) return true;
    if (!info.modified || info.viewCount !== 1) return true;
    const result = await showConfirmCloseTabDialog({ sceneName: info.sceneName });
    if (result === 'cancel') return false;
    if (result === 'discard') return true;
    // 'save': run the FileSave command; if save succeeds, proceed with close.
    // If the user cancels the save dialog (or save fails), abort the close --
    // matches UXP onSaveScene behaviour.
    const saved = await dispatchCommand(CmdId.FileSave);
    return saved === true;
  }, [cm, showConfirmCloseTabDialog, dispatchCommand]);

  const {
    tabs,
    tabsRef,
    activeTab,
    setActiveTab,
    openSettingsTab,
    addMolViewTab,
    updateMolViewTabTitle,
    handleCloseTab,
    handleReorderTabs,
  } = useTabManager({ onMolViewClose: handleMolViewClose, confirmCloseTab });

  // Persist user-defined style defaults (atom labels, view-input scalars) to
  // the user style file when the window closes -- UXP `Qm2Main.onUnLoad`
  // parity. The path is resolved by Main via APP_PATH.
  const saveUserStyleOnClose = useCallback(async (): Promise<void> => {
    if (!cm) return;
    const info = await window.electronAPI?.invoke(IPC.APP_PATH);
    const path = info?.userStylePath;
    if (path) await cm.saveUserStyle(path);
  }, [cm]);

  useWindowCloseHandler({
    tabsRef,
    handleCloseTab,
    setActiveTab,
    onBeforeProceed: saveUserStyleOnClose,
  });

  // Keep molview tab titles in sync with their scene name (Explorer rename,
  // scripts, undo, etc.) -- UXP TabMolView.onScenePropChanged equivalent.
  useMolViewTabTitleSync({ cm, molTabEntries, updateMolViewTabTitle });

  // Shared "create scene + view + register tab" action used by both the
  // launch path and the New Tab dialog (UXP onNewScene equivalent).
  const newScene = useNewSceneAction({ cm, addMolTab, addMolViewTab });

  // First scene/view on launch (StrictMode guarded)
  useAppInitialization({ cueMolReady, newScene });

  // Keep the active scene/view bound to the active CONTENT tab: activate the
  // worker view for a molview tab, or clear the active molview when a
  // non-molview tab (Settings / welcome) is shown, so the Explorer /
  // Inspector / File Open all follow the visible tab and treat a
  // non-molview tab as "no active scene".
  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeTab);
    if (tab?.type === 'molview' && tab.viewId !== undefined) {
      if (cm && cueMolReady) {
        setActiveViewByID(tab.viewId);
        cm.activateView(tab.viewId);
      }
    } else {
      clearActiveView();
    }
  }, [activeTab, tabs, cm, cueMolReady, setActiveViewByID, clearActiveView]);

  const activeMolViewId = tabs.find((t) => t.id === activeTab && t.type === 'molview')?.viewId;

  // TEMPORARY dev affordance: expose the CueMol client and active view id on
  // window so the AO/AA render pipeline can be toggled from the devtools console
  // before a real GUI control is ported, e.g.
  //   await window.__cm.invokeService('devRenderOpts',
  //       { viewId: window.__activeViewId, aoEnabled: true })
  // Remove together with devRenderOpts.service.ts once the UI ships.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__cm = cm;
    (window as unknown as Record<string, unknown>).__activeViewId = activeMolViewId;
  }, [cm, activeMolViewId]);

  // --- Render: Rendering-window bridge ---

  // All render UI lives in the modeless Rendering window; this bridge owns
  // the job lifecycle (the CueMol worker exists only in this renderer),
  // executes commands relayed from that window, and pushes job / target
  // state back.

  // Renderable targets offered in the render window's Target dropdown.
  // The scene name is the tab title minus its ":<viewIdx>" suffix. The live
  // title comes from the tab strip (`tabs`), which useMolViewTabTitleSync keeps
  // current on rename -- `molTabEntries[].title` is frozen at tab-creation time,
  // so reading it here left the render window's Target names stale.
  const renderTargetViews = useMemo(
    () =>
      molTabEntries.map((e) => {
        const liveTitle =
          tabs.find((t) => t.type === "molview" && t.viewId === e.view_id)?.title ??
          e.title;
        return {
          viewId: e.view_id,
          sceneId: e.scene_uid,
          sceneName: liveTitle.replace(/:\d+$/, ""),
          title: liveTitle,
        };
      }),
    [molTabEntries, tabs],
  );

  // --- Scene-exporter availability (hides Umbreon etc. on builds lacking it) ---
  // Probed here (before useRenderWindowBridge) so the umbreon capability can be
  // forwarded to the modeless render window, which has no worker of its own.
  const exportAvailable = useSceneExportCaps({ cm, cueMolReady });
  const umbreonAvailable = exportAvailable?.includes("umbreon") ?? false;

  useRenderWindowBridge({
    cm,
    views: renderTargetViews,
    activeViewId: activeMolViewId,
    tabs,
    setActiveTab,
    binaries: renderBinaries,
    umbreonAvailable,
  });

  // --- Scene-tree wiring (selection, handlers, ctxmenu, inline rename) ---
  // Aggregated into useSceneTreeController so App no longer destructures
  // ~40 useSceneTree callbacks and re-assembles them for useSceneContextMenu.
  const sceneController = useSceneTreeController({
    scene,
    cm,
    activeSceneId,
    activeMolViewId,
    showGeneric: handleShowGeneric,
  });

  // --- View-state cache for the active molview tab ---
  const {
    viewProjection,
    viewCenterMark,
    sceneBgColor,
    onProjectionChanged,
    onCenterMarkChanged,
    onBgColorChanged,
  } = useActiveViewState({ cm, activeMolViewId, activeSceneId });

  // --- Undo/redo availability + history dropdown (owns CmdId.Undo/Redo) ---
  const undoRedo = useUndoRedoState({ cm, activeMolViewId, getActiveSceneInfo });

  // --- View pane (Projection section) writers ---
  // Route through the existing view/scene commands so useActiveViewState (and
  // the native menu) remain the single source of truth for these attributes.
  const handleSetPerspective = useCallback((perspective: boolean) => {
    dispatchCommand(perspective ? CmdId.ViewPerspective : CmdId.ViewOrthographic)
      .catch((err: unknown) => console.warn("set perspective failed:", err));
  }, [dispatchCommand]);

  const handleSetCenterMark = useCallback((mark: ViewCenterMark) => {
    const cmd =
      mark === "crosshair" ? CmdId.ViewCenterMarkCross
      : mark === "axis" ? CmdId.ViewCenterMarkAxis
      : CmdId.ViewCenterMarkNone;
    dispatchCommand(cmd).catch((err: unknown) => console.warn("set center mark failed:", err));
  }, [dispatchCommand]);

  // --- All command handlers + Electron IPC bridge ---
  useCommandRegistrations({
    cm,
    addMolTab,
    addMolViewTab,
    getActiveSceneInfo,
    handleCloseTab,
    openSettingsTab,
    activeTab,
    activeMolViewId,
    onProjectionChanged,
    onCenterMarkChanged,
    onBgColorChanged,
    showViewProperty: handleShowViewProps,
    // Scene's tree-node id equals its scene uid; handleShowGeneric resolves it.
    showSceneProperty: (sceneId: number) => handleShowGeneric(String(sceneId)),
    newScene,
  });

  const cueMolBusy = useCueMolBusy();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Announce pointing-device switches (auto-detected or manual) in the status bar.
  useInputDeviceStatus(setStatusMessage);

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

  // --- Text clipboard context menu (Windows/Linux React menu path) ---
  useTextContextMenu();

  // --- Derived sidebar sub-panel state ---

  const viewSizes = layout.viewSizes ?? {
    explorer: [220, 240, 260],
    selection: [260, 180],
  };
  const viewCollapsed = layout.viewCollapsed ?? {
    explorer: { scene: false, color: false, view: false },
    selection: { mol: false, selection: false },
  };

  // --- Recent files (MRU) for the File > Open Recent submenu ---

  const recentFiles = useRecentFiles();

  // --- Derived values ---

  const sidebarVisible = activeView !== null;
  const settingsActive = tabs.find((t) => t.id === activeTab)?.type === "settings";

  // --- Render ---

  return (
    <ActiveToolProvider activeTool={activeTool}>
    {/* Phosphor icon defaults: inherit text color (theme-aware), regular weight. */}
    <IconContext.Provider value={{ color: "currentColor", weight: "regular" }}>
    <div className="app">
      {window.electronAPI?.platform !== 'darwin' && (
        <MenuBar activeTab={activeTab} viewProjection={viewProjection} viewCenterMark={viewCenterMark} sceneBgColor={sceneBgColor} hasScene={activeMolViewId !== undefined} exportAvailable={exportAvailable} recentFiles={recentFiles} />
      )}
      <Toolbar undoRedo={undoRedo} hasScene={activeMolViewId !== undefined} />

      <div className="main-layout">
        <div className="main-layout-inner">
          <ActivityBar
            activeView={activeView}
            onSelect={handleActivitySelect}
            onSettingsClick={openSettingsTab}
            settingsActive={settingsActive}
          />

          <div className="main-content-area">
            {loaded && (
              <Allotment
                onChange={handleMainSizesChange}
                defaultSizes={
                  layout.mainSizes && layout.mainSizes.length > 0
                    ? layout.mainSizes
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
                  <SidePanel
                    activeView={activeView ?? "explorer"}
                    cm={cm}
                    activeSceneId={activeSceneId}
                    activeMolViewId={activeMolViewId}
                    viewProjection={viewProjection}
                    viewCenterMark={viewCenterMark}
                    onSetPerspective={handleSetPerspective}
                    onSetCenterMark={handleSetCenterMark}
                    {...sceneController}
                    viewSizes={viewSizes}
                    viewCollapsed={viewCollapsed}
                    onViewSizesChange={setViewSizes}
                    onViewCollapsedChange={setViewCollapsed}
                  />
                </Allotment.Pane>

                {/* Right section: center + inspector */}
                <Allotment.Pane>
                  <Allotment
                    onChange={handleRightPanelSizesChange}
                    defaultSizes={
                      layout.rightPanelSizes && layout.rightPanelSizes.length > 0
                        ? layout.rightPanelSizes
                        : undefined
                    }
                  >
                    {/* Center: ContentArea + BottomPanel (vertical split) */}
                    <Allotment.Pane>
                      <Allotment
                        vertical
                        onChange={setCenterSizes}
                        defaultSizes={
                          layout.centerSizes && layout.centerSizes.length > 0
                            ? layout.centerSizes
                            : undefined
                        }
                      >
                        <Allotment.Pane>
                          <ContentArea
                            tabs={tabs}
                            activeTab={activeTab}
                            onSelectTab={setActiveTab}
                            onCloseTab={handleCloseTab}
                            onReorderTabs={handleReorderTabs}
                            activeTool={activeTool}
                            onSelectTool={setActiveTool}
                            onStatusMessage={setStatusMessage}
                          />
                        </Allotment.Pane>
                        <Allotment.Pane minSize={100} preferredSize={200} snap>
                          <BottomPanel
                            cm={cm}
                            activeSceneId={activeSceneId}
                            activeMolViewId={activeMolViewId}
                            onInspectAnimElement={handleInspectAnimElement}
                          />
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
                      visible={inspectorOpen && inspectorTarget !== null}
                      snap
                    >
                      <InspectorPanel
                        hasTarget={inspectorTarget !== null}
                        targetKind={inspectorTarget?.kind ?? null}
                        targetCategory={inspectorCategory}
                        nodeName={
                          inspectorTarget?.kind === "animElement"
                            ? (animHeader?.name ?? "")
                            : inspectorInfo.name
                        }
                        nodeType={
                          inspectorTarget?.kind === "animElement"
                            ? (animHeader?.type ?? "")
                            : inspectorInfo.type
                        }
                        genericEntries={genericEntries}
                        genericLoading={genericLoading}
                        onGenericSet={handleGenericSet}
                        onGenericSetMany={handleSetMany}
                        onGenericReset={handleGenericReset}
                        onResetMany={handleResetMany}
                        onClose={handleCloseInspectorWithAnim}
                        cm={cm}
                        sceneId={activeSceneId}
                        nodeId={
                          inspectorTarget?.kind === "node"
                            ? inspectorTarget.nodeId
                            : undefined
                        }
                        animElement={
                          inspectorTarget?.kind === "animElement"
                            ? { sceneId: inspectorTarget.sceneId, uid: inspectorTarget.uid }
                            : null
                        }
                        onAnimElementGone={handleAnimElementGone}
                        onAnimHeaderChange={handleAnimHeaderChange}
                      />
                    </Allotment.Pane>
                  </Allotment>
                </Allotment.Pane>
              </Allotment>
            )}
          </div>
        </div>
      </div>

      <StatusBar
        activeToolLabel={activeDef.label}
        activeToolShortcut={activeDef.shortcut}
        activeToolIcon={activeDef.icon}
        busy={cueMolBusy}
        statusMessage={statusMessage}
      />
    </div>
    </IconContext.Provider>
    </ActiveToolProvider>
  );
};

export default App;
