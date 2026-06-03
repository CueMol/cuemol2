/**
 * Root component of the CueMol desktop application.
 *
 * Layout: Toolbar / [ActivityBar | SidePanel | [ContentArea / BottomPanel] | InspectorPanel] / StatusBar
 *
 * Most domain wiring lives in extracted hooks:
 *   - useAppInitialization      — first scene/view on launch (StrictMode guarded)
 *   - useActiveViewState        — viewProjection / centerMark / bgColor cache + menu sync
 *   - useCommandRegistrations   — registers all CmdId handlers + Electron IPC bridge
 */

import React, { useState, useCallback, useEffect } from "react";
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

import type { AnimationData } from "./types";

import { SAMPLE_ANIMATION } from "./data/alignmentData";
import { installSelectAllScope } from "./utils/selectAllScope";

import { useLayoutPersistence } from "./hooks/useLayoutPersistence";
import { useActiveTool } from "./hooks/useActiveTool";
import { ActiveToolProvider } from "./contexts/ActiveToolContext";
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
import { useActiveViewState } from "./hooks/useActiveViewState";
import { useCommandRegistrations } from "./hooks/useCommandRegistrations";
import { useRecentFiles } from "./hooks/useRecentFiles";
import { useCommands } from "./commands/CommandRegistry";
import { CmdId } from "./commands/ids";
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
  const { addMolTab, removeMolTab, getActiveSceneInfo, setActiveViewByID } = useMolTabDispatch();
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
  });

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
    const info = await cm.getSceneCloseInfo(viewId);
    if (!info?.ok) return true;
    if (!info.modified || info.viewCount !== 1) return true;
    const result = await showConfirmCloseTabDialog({ sceneName: info.sceneName });
    if (result === 'cancel') return false;
    if (result === 'discard') return true;
    // 'save': run the FileSave command; if save succeeds, proceed with close.
    // If the user cancels the save dialog (or save fails), abort the close —
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
    addRenderResultTab,
    handleCloseTab,
    handleReorderTabs,
  } = useTabManager({ onMolViewClose: handleMolViewClose, confirmCloseTab });

  useWindowCloseHandler({ tabsRef, handleCloseTab, setActiveTab });

  // Shared "create scene + view + register tab" action used by both the
  // launch path and the New Tab dialog (UXP onNewScene equivalent).
  const newScene = useNewSceneAction({ cm, addMolTab, addMolViewTab });

  // First scene/view on launch (StrictMode guarded)
  useAppInitialization({ cueMolReady, newScene });

  // Activate worker view when a molview tab becomes active.
  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeTab);
    if (tab?.type === 'molview' && tab.viewId !== undefined && cm && cueMolReady) {
      setActiveViewByID(tab.viewId);
      cm.activateView(tab.viewId);
    }
  }, [activeTab, tabs, cm, cueMolReady, setActiveViewByID]);

  const activeMolViewId = tabs.find((t) => t.id === activeTab && t.type === 'molview')?.viewId;

  // --- Render: job lifecycle + Render Result tab ---

  // Render job for the BottomPanel Render tab. On completion the worker
  // sends the rendered image; `addRenderResultTab` opens (or overwrites)
  // the source scene's result tab.
  const renderJob = useRenderJob({ cm, onComplete: addRenderResultTab });

  /**
   * Start a render from the current Render Settings (Start button / F12).
   * Uses the active molview's scene/view from `getActiveSceneInfo` — this
   * stays correct even when a Render Result tab is the active content tab
   * (so the render captures the latest camera via `saveViewToCam`).
   */
  const handleRenderStart = useCallback(() => {
    const info = getActiveSceneInfo();
    if (!info) return;
    const source: RenderSource = {
      sceneId: info.scene_uid,
      sceneName: scene.tree?.name ?? `Scene ${info.scene_uid}`,
      viewId: info.view_id,
    };
    void renderJob.start({
      sceneId: info.scene_uid,
      viewId: info.view_id,
      snapshot: renderSettings.getSnapshot(),
      source,
      binaries: renderBinaries,
    });
  }, [getActiveSceneInfo, scene.tree, renderJob, renderSettings, renderBinaries]);

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
  } = useActiveViewState({ cm, activeMolViewId, getActiveSceneInfo });

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

  // --- Sample data ---
  const [animation] = useState<AnimationData | null>(SAMPLE_ANIMATION);

  const cueMolBusy = useCueMolBusy();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
    explorer: [220, 240],
    selection: [260, 180],
  };
  const viewCollapsed = layout.viewCollapsed ?? {
    explorer: { scene: false, color: false },
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
    <div className="app">
      {window.electronAPI?.platform !== 'darwin' && (
        <MenuBar activeTab={activeTab} viewProjection={viewProjection} viewCenterMark={viewCenterMark} sceneBgColor={sceneBgColor} recentFiles={recentFiles} />
      )}
      <Toolbar />

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
                            onOpenRenderSettings={handleShowRenderSettings}
                          />
                        </Allotment.Pane>
                        <Allotment.Pane minSize={100} preferredSize={200} snap>
                          <BottomPanel
                            cm={cm}
                            activeSceneId={activeSceneId}
                            activeMolViewId={activeMolViewId}
                            animation={animation}
                            renderJob={renderJob.job}
                            renderPreset={renderSettings.preset}
                            onRenderStart={handleRenderStart}
                            onRenderCancel={renderJob.cancel}
                            onRenderApplyPreset={handleApplyRenderPreset}
                            onOpenRenderSettings={handleShowRenderSettings}
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
                        nodeName={inspectorInfo.name}
                        nodeType={inspectorInfo.type}
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
                        onClose={handleCloseInspector}
                        cm={cm}
                        sceneId={activeSceneId}
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
    </ActiveToolProvider>
  );
};

export default App;
