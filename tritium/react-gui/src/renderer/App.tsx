/**
 * Root component of the CueMol desktop application.
 *
 * Layout: Toolbar / [ActivityBar | SidePanel | [ContentArea / BottomPanel] | InspectorPanel] / StatusBar
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import type { SceneManager } from "@cuemol/core/src/wrappers/SceneManager";
import { Allotment } from "allotment";
import "allotment/dist/style.css";

import { ActivityBar, type ActivityView } from "./components/ActivityBar";
import { MenuBar } from "./components/MenuBar";
import { Toolbar } from "./components/Toolbar";
import { SidePanel } from "./components/SidePanel";
import { ContentArea } from "./components/ContentArea";
import { BottomPanel } from "./components/BottomPanel";
import { StatusBar } from "./components/StatusBar";
import { InspectorPanel } from "./components/InspectorPanel";

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
import { useElectronIpc } from "./hooks/useElectronIpc";
import { useSceneCommands } from "./commands/useSceneCommands";
import { useCueMolBusy } from "./hooks/useCueMolBusy";

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

  const {
    tabs,
    activeTab,
    setActiveTab,
    openFileFromData,
    openSettingsTab,
    addMolViewTab,
    handleOpenFile,
    handleCloseTab,
    handleNewTab,
    handleReorderTabs,
    handleSave,
  } = useTabManager();

  // --- CueMol core ready: create initial scene/view ---

  const { cueMolReady, cm } = useCueMol();
  const { addMolTab, getActiveSceneInfo, setActiveViewByID } = useMolTabDispatch();

  // Guard to prevent duplicate initial scene creation (React StrictMode)
  const initialSceneCreatedRef = useRef(false);

  useEffect(() => {
    if (!cueMolReady || !cm) return;
    if (initialSceneCreatedRef.current) return;
    initialSceneCreatedRef.current = true;

    let cancelled = false;
    (async () => {
      const sceMgr = (await cm.getService('SceneManager')) as SceneManager;
      if (!sceMgr || cancelled) return;
      const scene = await sceMgr.createScene();
      const scene_uid = await scene.getUID();
      const view = await scene.createView();
      const view_uid = await view.getUID();
      if (cancelled) return;
      const title = `Scene ${scene_uid}`;
      // Register in MolTabState first so MolViewPane can read getActiveViewID()
      addMolTab(title, view_uid, scene_uid);
      // Open the outer tab (causes ContentPane to mount MolViewPane)
      addMolViewTab(title, view_uid);
    })();
    return () => { cancelled = true; };
  }, [cueMolReady, cm, addMolTab, addMolViewTab]);

  // --- Activate view when molview tab becomes active ---

  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeTab);
    if (tab?.type === 'molview' && tab.viewId !== undefined && cm && cueMolReady) {
      setActiveViewByID(tab.viewId);
      cm.activateView(tab.viewId);
    }
  }, [activeTab, tabs, cm, cueMolReady, setActiveViewByID]);

  // --- Sample data ---

  const [alignment] = useState<AlignmentData | null>(SAMPLE_ALIGNMENT);
  const [animation] = useState<AnimationData | null>(SAMPLE_ANIMATION);

  // --- Command registrations and IPC wiring ---

  useSceneCommands({
    cm,
    addMolTab,
    addMolViewTab,
    getActiveSceneInfo,
    openFileFromData,
    handleNewTab,
    handleCloseTab,
    handleSave,
  });

  useElectronIpc(activeTab);

  const cueMolBusy = useCueMolBusy();

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
        <MenuBar activeTab={activeTab} />
      )}
      <Toolbar
        onOpenFile={handleOpenFile}
        onNewTab={handleNewTab}
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
