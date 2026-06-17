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
import { useInputDeviceStatus } from "./hooks/useInputDeviceStatus";
import { useActiveTool } from "./hooks/useActiveTool";
import { ActiveToolProvider } from "./contexts/ActiveToolContext";
import { IconContext } from "@phosphor-icons/react";
import { useSceneTree } from "./hooks/useSceneTree";
import { useSceneTreeController } from "./hooks/useSceneTreeController";
import { useInspectorState } from "./hooks/useInspectorState";
import { useRenderSettings } from "./hooks/useRenderSettings";
import { useRenderJob, isRenderJobActive } from "./hooks/useRenderJob";
import { RENDER_BACKEND_IDS } from "./data/renderBackends";
import { RENDER_SIZE_PRESETS } from "./data/renderSettings";
import type { RenderResult, RenderSource } from "./data/renderResult";
import { useTabManager } from "./hooks/useTabManager";
import { useCueMol } from "./hooks/useCueMol";
import { useMolTabDispatch, useMolTabState } from "./hooks/useMolTab";
import { useAppInitialization } from "./hooks/useAppInitialization";
import { useNewSceneAction } from "./hooks/useNewSceneAction";
import { useMolViewTabTitleSync } from "./hooks/useMolViewTabTitleSync";
import { useActiveViewState } from "./hooks/useActiveViewState";
import { useUndoRedoState } from "./hooks/useUndoRedoState";
import { useCommandRegistrations } from "./hooks/useCommandRegistrations";
import { useRecentFiles } from "./hooks/useRecentFiles";
import { useCommands } from "./commands/CommandRegistry";
import { CmdId } from "./commands/ids";
import type { ViewCenterMark } from "../shared/ipcTypes";
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
    handleShowRenderSettings,
    handleShowAnimElement,
    handleClearAnimElement,
    handleCloseInspector,
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

  // Render Settings editing state (non-persistent) for the inspector
  // `renderSettings` target.
  const renderSettings = useRenderSettings();

  // Persistent render binary paths (POV-Ray / blendpng) from SettingsPane.
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
    addRenderResultTab,
    handleCloseTab,
    handleReorderTabs,
  } = useTabManager({ onMolViewClose: handleMolViewClose, confirmCloseTab });

  useWindowCloseHandler({ tabsRef, handleCloseTab, setActiveTab });

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
  // non-molview tab (Settings / render result / welcome) is shown, so the
  // Explorer / Inspector / File Open all follow the visible tab and treat a
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

  // --- Render: job lifecycle + Render Result tab ---

  // Render job for the BottomPanel Render tab. On completion the worker
  // sends the rendered image; `addRenderResultTab` opens (or overwrites)
  // the source scene's result tab.
  const renderJob = useRenderJob({ cm, onComplete: addRenderResultTab });

  /**
   * Start a render from the current Render Settings (Start button / F12).
   * Resolves the target from the active content tab: a molview tab renders its
   * own scene/view; a Render Result tab renders the scene it depicts (its
   * source), so re-rendering from a result tab still works now that the active
   * scene follows the visible tab. Other tabs (Settings / welcome) have no
   * scene to render.
   */
  const handleRenderStart = useCallback(() => {
    const activeTabData = tabs.find((t) => t.id === activeTab);
    let source: RenderSource | null = null;
    if (
      activeTabData?.type === 'renderResult' &&
      activeTabData.renderResult?.sourceViewId !== undefined
    ) {
      const rr = activeTabData.renderResult;
      source = {
        sceneId: rr.sourceSceneId,
        sceneName: rr.sourceSceneName,
        viewId: rr.sourceViewId,
      };
    } else {
      const info = getActiveSceneInfo();
      if (info) {
        source = {
          sceneId: info.scene_uid,
          sceneName: scene.tree?.name ?? `Scene ${info.scene_uid}`,
          viewId: info.view_id,
        };
      }
    }
    if (!source) return;
    void renderJob.start({
      sceneId: source.sceneId,
      viewId: source.viewId,
      snapshot: renderSettings.getSnapshot(),
      source,
      binaries: renderBinaries,
    });
  }, [tabs, activeTab, getActiveSceneInfo, scene.tree, renderJob, renderSettings, renderBinaries]);

  /**
   * Whether the active tab can be rendered now. Mirrors the source resolution
   * in handleRenderStart so the Render tab's Start button is enabled exactly
   * when a render would actually run: a molview tab, or a Render Result tab that
   * still knows its source view. Settings / welcome tabs have no scene, so the
   * button is disabled rather than silently doing nothing.
   */
  const canRender = useMemo(() => {
    const activeTabData = tabs.find((t) => t.id === activeTab);
    if (activeTabData?.type === 'renderResult') {
      return activeTabData.renderResult?.sourceViewId !== undefined;
    }
    return activeMolViewId !== undefined;
  }, [tabs, activeTab, activeMolViewId]);

  /**
   * Scene id whose Render Settings the gear should open: a molview tab's own
   * scene, or a render-result tab's source scene. On a render-result tab
   * activeSceneId is undefined (no active molview), so handleShowRenderSettings
   * needs this explicit id -- otherwise the gear silently does nothing.
   */
  const renderSourceSceneId = useMemo(() => {
    const activeTabData = tabs.find((t) => t.id === activeTab);
    if (activeTabData?.type === 'renderResult') {
      return activeTabData.renderResult?.sourceSceneId;
    }
    return activeSceneId;
  }, [tabs, activeTab, activeSceneId]);

  const handleOpenRenderSettings = useCallback(
    () => handleShowRenderSettings(renderSourceSceneId),
    [handleShowRenderSettings, renderSourceSceneId],
  );

  /** Re-render from a result tab's snapshot (also restores it into the editor). */
  const handleReRender = useCallback(
    (result: RenderResult) => {
      renderSettings.restore(result.settingsSnapshot);
      void renderJob.start({
        sceneId: result.sourceSceneId,
        viewId: result.sourceViewId,
        snapshot: result.settingsSnapshot,
        source: {
          sceneId: result.sourceSceneId,
          sceneName: result.sourceSceneName,
          viewId: result.sourceViewId,
        },
        binaries: renderBinaries,
      });
    },
    [renderSettings, renderJob, renderBinaries],
  );

  /** Switch to a result tab's source scene (its molview tab). */
  const handleShowSourceScene = useCallback(
    (result: RenderResult) => {
      if (result.sourceViewId === undefined) return;
      const tab = tabs.find(
        (t) => t.type === "molview" && t.viewId === result.sourceViewId,
      );
      if (tab) setActiveTab(tab.id);
    },
    [tabs, setActiveTab],
  );

  /**
   * Apply an image-size preset from the Render tab. The "Current view"
   * preset is resolved from the live molview canvas pixel size.
   */
  const handleApplyRenderPreset = useCallback(
    (label: string) => {
      const preset = RENDER_SIZE_PRESETS.find((p) => p.label === label);
      if (preset?.dynamic) {
        const canvas = document.querySelector("canvas");
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          const width = Math.round(rect.width * dpr);
          const height = Math.round(rect.height * dpr);
          if (width > 0 && height > 0) {
            renderSettings.applyPreset(label, { width, height });
            return;
          }
        }
      }
      renderSettings.applyPreset(label);
    },
    [renderSettings],
  );

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
    activeTab,
    activeMolViewId,
    onProjectionChanged,
    onCenterMarkChanged,
    onBgColorChanged,
    showViewProperty: handleShowViewProps,
    showRenderSettings: handleShowRenderSettings,
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

  // StatusBar: a running render takes precedence over tool-hover messages.
  const activeRenderJob = isRenderJobActive(renderJob.job) ? renderJob.job : null;
  const statusBarMessage = activeRenderJob
    ? `Rendering… ${activeRenderJob.progress}%`
    : statusMessage;

  // --- Render ---

  return (
    <ActiveToolProvider activeTool={activeTool}>
    {/* Phosphor icon defaults: inherit text color (theme-aware), regular weight. */}
    <IconContext.Provider value={{ color: "currentColor", weight: "regular" }}>
    <div className="app">
      {window.electronAPI?.platform !== 'darwin' && (
        <MenuBar activeTab={activeTab} viewProjection={viewProjection} viewCenterMark={viewCenterMark} sceneBgColor={sceneBgColor} hasScene={activeMolViewId !== undefined} recentFiles={recentFiles} />
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
                onChange={setMainSizes}
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
                    onChange={setRightPanelSizes}
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
                            onReRender={handleReRender}
                            onShowSourceScene={handleShowSourceScene}
                            onOpenRenderSettings={handleOpenRenderSettings}
                          />
                        </Allotment.Pane>
                        <Allotment.Pane minSize={100} preferredSize={200} snap>
                          <BottomPanel
                            cm={cm}
                            activeSceneId={activeSceneId}
                            activeMolViewId={activeMolViewId}
                            renderJob={renderJob.job}
                            renderCanStart={canRender}
                            renderPreset={renderSettings.preset}
                            onRenderStart={handleRenderStart}
                            onRenderCancel={renderJob.cancel}
                            onRenderApplyPreset={handleApplyRenderPreset}
                            onOpenRenderSettings={handleOpenRenderSettings}
                            onInspectAnimElement={handleInspectAnimElement}
                          />
                        </Allotment.Pane>
                      </Allotment>
                    </Allotment.Pane>

                    {/* Right: Inspector */}
                    <Allotment.Pane
                      minSize={240}
                      preferredSize={300}
                      visible={inspectorOpen}
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
                        renderSettings={{
                          backend: renderSettings.backend,
                          backendIds: RENDER_BACKEND_IDS,
                          commonProps: renderSettings.commonProps,
                          backendProps: renderSettings.backendProps,
                          onBackendChange: renderSettings.setBackend,
                          onChange: renderSettings.handleChange,
                        }}
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
        busy={cueMolBusy || activeRenderJob !== null}
        statusMessage={statusBarMessage}
      />
    </div>
    </IconContext.Provider>
    </ActiveToolProvider>
  );
};

export default App;
