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

import type { AlignmentData, AnimationData } from "./types";

import { SAMPLE_ALIGNMENT, SAMPLE_ANIMATION } from "./data/alignmentData";

import { useLayoutPersistence } from "./hooks/useLayoutPersistence";
import { useActiveTool } from "./hooks/useActiveTool";
import { ActiveToolProvider } from "./contexts/ActiveToolContext";
import { useSceneState } from "./hooks/useSceneState";
import { useInspectorState } from "./hooks/useInspectorState";
import { useTabManager } from "./hooks/useTabManager";
import { useCueMol } from "./hooks/useCueMol";
import { useMolTabDispatch } from "./hooks/useMolTab";
import { useAppInitialization } from "./hooks/useAppInitialization";
import { useActiveViewState } from "./hooks/useActiveViewState";
import { useCommandRegistrations } from "./hooks/useCommandRegistrations";
import { useCommands } from "./commands/CommandRegistry";
import { CmdId } from "./commands/ids";
import { useCueMolBusy } from "./hooks/useCueMolBusy";
import { useShowConfirmCloseTabDialog } from "./components/dialogs/ConfirmCloseTabDialogProvider";

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

  // --- Domain hooks ---

  const {
    scene,
    sceneSelected,
    setSceneSelected,
    handleToggleVisibility,
    resolveNodeName,
  } = useSceneState();

  const {
    inspectorOpen,
    rendererProps,
    genericProps,
    inspectorInfo,
    handleShowProperty,
    handleCloseInspector,
    handlePropertyChange,
    handleGenericChange,
  } = useInspectorState({
    layout,
    loaded,
    persistInspectorOpen,
    resolveNodeName,
  });

  // --- CueMol core / tabs ---

  const { cueMolReady, cm } = useCueMol();
  const { addMolTab, removeMolTab, getActiveSceneInfo, setActiveViewByID } = useMolTabDispatch();
  const showConfirmCloseTabDialog = useShowConfirmCloseTabDialog();

  const handleMolViewClose = useCallback((viewId: number) => {
    removeMolTab(viewId);
    if (cm) {
      cm.removeView(viewId).catch((err: unknown) => {
        console.warn('removeView failed:', err);
      });
    }
  }, [cm, removeMolTab]);

  const confirmCloseTab = useCallback(async (viewId: number): Promise<boolean> => {
    if (!cm) return true;
    const info = await cm.getSceneCloseInfo(viewId);
    if (!info?.ok) return true;
    if (!info.modified || info.viewCount !== 1) return true;
    const result = await showConfirmCloseTabDialog({ sceneName: info.sceneName });
    if (result === 'cancel') return false;
    if (result === 'discard') return true;
    // 'save': Save button is disabled (not yet implemented); abort close.
    console.warn('[TODO] Scene save not yet implemented');
    return false;
  }, [cm, showConfirmCloseTabDialog]);

  const {
    tabs,
    activeTab,
    setActiveTab,
    openSettingsTab,
    addMolViewTab,
    handleCloseTab,
    handleReorderTabs,
    handleSave,
  } = useTabManager({ onMolViewClose: handleMolViewClose, confirmCloseTab });

  // First scene/view on launch (StrictMode guarded)
  useAppInitialization({ cm, cueMolReady, addMolTab, addMolViewTab });

  // Activate worker view when a molview tab becomes active.
  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeTab);
    if (tab?.type === 'molview' && tab.viewId !== undefined && cm && cueMolReady) {
      setActiveViewByID(tab.viewId);
      cm.activateView(tab.viewId);
    }
  }, [activeTab, tabs, cm, cueMolReady, setActiveViewByID]);

  const activeMolViewId = tabs.find((t) => t.id === activeTab && t.type === 'molview')?.viewId;

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
    handleSave,
    activeTab,
    activeMolViewId,
    onProjectionChanged,
    onCenterMarkChanged,
    onBgColorChanged,
  });

  // --- Sample data ---
  const [alignment] = useState<AlignmentData | null>(SAMPLE_ALIGNMENT);
  const [animation] = useState<AnimationData | null>(SAMPLE_ANIMATION);

  const cueMolBusy = useCueMolBusy();
  const { dispatch: dispatchCommand } = useCommands();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // --- macOS traffic-light inset ---

  useEffect(() => {
    if (window.electronAPI?.platform === "darwin") {
      document.documentElement.style.setProperty("--titlebar-inset", "78px");
    }
  }, []);

  // --- Derived sidebar sub-panel state ---

  const viewSizes = layout.viewSizes ?? {
    explorer: [220, 240],
    selection: [260, 180],
  };
  const viewCollapsed = layout.viewCollapsed ?? {
    explorer: { scene: false, color: false },
    selection: { mol: false, selection: false },
  };

  // --- Derived values ---

  const sidebarVisible = activeView !== null;
  const settingsActive = tabs.find((t) => t.id === activeTab)?.type === "settings";

  // --- Render ---

  return (
    <ActiveToolProvider activeTool={activeTool}>
    <div className="app">
      {window.electronAPI?.platform !== 'darwin' && (
        <MenuBar activeTab={activeTab} viewProjection={viewProjection} viewCenterMark={viewCenterMark} sceneBgColor={sceneBgColor} />
      )}
      <Toolbar
        onOpenFile={() => dispatchCommand(CmdId.UiOpenObjDialog).catch((e: unknown) => console.error('UiOpenObjDialog failed:', e))}
        onNewTab={() => dispatchCommand(CmdId.TabNew).catch((e: unknown) => console.error('TabNew failed:', e))}
        onSave={handleSave}
      />

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
                    scene={scene}
                    sceneSelected={sceneSelected}
                    onSceneSelect={setSceneSelected}
                    onToggleVisibility={handleToggleVisibility}
                    onShowProperty={handleShowProperty}
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
                          />
                        </Allotment.Pane>
                        <Allotment.Pane minSize={100} preferredSize={200} snap>
                          <BottomPanel
                            alignment={alignment}
                            animation={animation}
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
                        rendererName={inspectorInfo.name}
                        rendererType={inspectorInfo.type}
                        properties={rendererProps}
                        genericEntries={genericProps}
                        onPropertyChange={handlePropertyChange}
                        onGenericChange={handleGenericChange}
                        onClose={handleCloseInspector}
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
    </ActiveToolProvider>
  );
};

export default App;
