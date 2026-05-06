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
import { SidePanel } from "./components/panels/SidePanel";
import { ContentArea } from "./components/ContentArea";
import { BottomPanel } from "./components/panels/BottomPanel";
import { StatusBar } from "./components/StatusBar";
import { InspectorPanel } from "./components/panels/InspectorPanel";

import type { AlignmentData, AnimationData } from "./types";
import type { SceneBgColor, ViewCenterMark } from "../shared/ipcTypes";

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
import { useUiDialogCommands } from "./commands/useUiDialogCommands";
import { useTabCommands } from "./commands/useTabCommands";
import { useNewTabCommand } from "./commands/useNewTabCommand";
import { useEditCommands } from "./commands/useEditCommands";
import { useViewCommands } from "./commands/useViewCommands";
import { useCommands } from "./commands/CommandRegistry";
import { CmdId } from "./commands/ids";
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

  // --- CueMol core ready: create initial scene/view ---

  const { cueMolReady, cm } = useCueMol();
  const { addMolTab, removeMolTab, getActiveSceneInfo, setActiveViewByID } = useMolTabDispatch();

  const handleMolViewClose = useCallback((viewId: number) => {
    removeMolTab(viewId);
    if (cm) {
      cm.removeView(viewId).catch((err: unknown) => {
        console.warn('removeView failed:', err);
      });
    }
  }, [cm, removeMolTab]);

  const {
    tabs,
    activeTab,
    setActiveTab,
    openFileFromData,
    openSettingsTab,
    addMolViewTab,
    handleOpenFile,
    handleCloseTab,
    handleReorderTabs,
    handleSave,
  } = useTabManager({ onMolViewClose: handleMolViewClose });

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
  const [viewProjection, setViewProjection] = useState<boolean | null>(null);
  const [viewCenterMark, setViewCenterMark] = useState<ViewCenterMark | null>(null);
  const [sceneBgColor, setSceneBgColor] = useState<SceneBgColor | null>(null);
  const activeMolViewId = tabs.find((t) => t.id === activeTab && t.type === 'molview')?.viewId;

  const syncNativeViewMenu = useCallback((state: {
    perspective?: boolean | null;
    centerMark?: ViewCenterMark | null;
    bgColor?: SceneBgColor | null;
  }) => {
    window.electronAPI?.updateMenuState({
      ...(state.perspective !== undefined
        ? { viewProjection: { enabled: state.perspective !== null, perspective: state.perspective } }
        : {}),
      ...(state.centerMark !== undefined
        ? { viewCenterMark: { enabled: state.centerMark !== null, centerMark: state.centerMark } }
        : {}),
      ...(state.bgColor !== undefined
        ? { sceneBgColor: { enabled: state.bgColor !== null, bgColor: state.bgColor } }
        : {}),
    }).catch((err: unknown) => {
      console.warn('update menu state failed:', err);
    });
  }, []);

  const handleProjectionChanged = useCallback((perspective: boolean) => {
    setViewProjection(perspective);
    syncNativeViewMenu({ perspective });
  }, [syncNativeViewMenu]);

  const handleCenterMarkChanged = useCallback((centerMark: ViewCenterMark) => {
    setViewCenterMark(centerMark);
    syncNativeViewMenu({ centerMark });
  }, [syncNativeViewMenu]);

  const handleBgColorChanged = useCallback((bgColor: SceneBgColor) => {
    setSceneBgColor(bgColor);
    syncNativeViewMenu({ bgColor });
  }, [syncNativeViewMenu]);

  // --- Command registrations and IPC wiring ---

  useSceneCommands({
    cm,
    addMolTab,
    addMolViewTab,
    getActiveSceneInfo,
    openFileFromData,
    onBgColorChanged: handleBgColorChanged,
  });

  useUiDialogCommands({ cm });

  useTabCommands({ handleCloseTab });

  useNewTabCommand({ cm, addMolTab, addMolViewTab, getActiveSceneInfo });

  useEditCommands({ cm, getActiveSceneInfo, handleSave });

  useViewCommands({
    cm,
    getActiveViewId: () => activeMolViewId,
    onProjectionChanged: handleProjectionChanged,
    onCenterMarkChanged: handleCenterMarkChanged,
  });

  useElectronIpc(activeTab);

  const cueMolBusy = useCueMolBusy();
  const { dispatch: dispatchCommand } = useCommands();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // --- macOS traffic-light inset ---

  useEffect(() => {
    if (window.electronAPI?.platform === "darwin") {
      document.documentElement.style.setProperty("--titlebar-inset", "78px");
    }
  }, []);

  useEffect(() => {
    if (!cm || activeMolViewId === undefined) {
      setViewProjection(null);
      setViewCenterMark(null);
      setSceneBgColor(null);
      syncNativeViewMenu({ perspective: null, centerMark: null, bgColor: null });
      return;
    }

    const sceneInfo = getActiveSceneInfo();
    const sceneId = sceneInfo?.scene_uid;

    let cancelled = false;
    Promise.all([
      cm.getViewProjection(activeMolViewId),
      cm.getViewCenterMark(activeMolViewId),
      sceneId !== undefined ? cm.getSceneBgColor(sceneId) : Promise.resolve(null),
    ]).then(([projectionResult, centerMarkResult, bgColorResult]) => {
      if (cancelled) return;
      const perspective = projectionResult?.ok ? projectionResult.perspective : null;
      const centerMark = centerMarkResult?.ok ? centerMarkResult.centerMark : null;
      const bgColor = bgColorResult?.ok ? bgColorResult.bgColor : null;
      setViewProjection(perspective);
      setViewCenterMark(centerMark);
      setSceneBgColor(bgColor);
      syncNativeViewMenu({ perspective, centerMark, bgColor });
    }).catch((err: unknown) => {
      if (!cancelled) {
        console.warn('get view state failed:', err);
        setViewProjection(null);
        setViewCenterMark(null);
        setSceneBgColor(null);
        syncNativeViewMenu({ perspective: null, centerMark: null, bgColor: null });
      }
    });

    return () => { cancelled = true; };
  }, [activeMolViewId, cm, syncNativeViewMenu, getActiveSceneInfo]);

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
        onOpenFile={handleOpenFile}
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
