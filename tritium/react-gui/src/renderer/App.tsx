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
import { useSceneTree } from "./hooks/useSceneTree";
import { useSceneContextMenu } from "./hooks/useSceneContextMenu";
import { useInspectorState } from "./hooks/useInspectorState";
import { useTabManager } from "./hooks/useTabManager";
import { useCueMol } from "./hooks/useCueMol";
import { useMolTabDispatch, useMolTabState } from "./hooks/useMolTab";
import { useAppInitialization } from "./hooks/useAppInitialization";
import { useNewSceneAction } from "./hooks/useNewSceneAction";
import { useActiveViewState } from "./hooks/useActiveViewState";
import { useCommandRegistrations } from "./hooks/useCommandRegistrations";
import { useCommands } from "./commands/CommandRegistry";
import { CmdId } from "./commands/ids";
import { useCueMolBusy } from "./hooks/useCueMolBusy";
import { useShowConfirmCloseTabDialog } from "./components/dialogs/ConfirmCloseTabDialogProvider";
import { useShowNodePropertyDialog } from "./components/dialogs/NodePropertyDialogProvider";
import { useQuitHandler } from "./hooks/useQuitHandler";

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

  const {
    tree: sceneTree,
    selectedId: sceneSelected,
    selectedIds: sceneSelectedIds,
    selectedHasOps: sceneOpsEnabled,
    setSelectedId: setSceneSelected,
    toggleInSelection: toggleSceneSelected,
    toggleVisibility: handleToggleVisibility,
    focusNode: focusSceneNode,
    deleteNode: deleteSceneNode,
    renameNode: renameSceneNode,
    selectObjectMol: selectSceneObjectMol,
    copyNode: copySceneNode,
    pasteNode: pasteSceneNode,
    setRendererColoring: setSceneRendererColoring,
    paintRendererSelection: paintSceneRendererSelection,
    paintObjectSelection: paintSceneObjectSelection,
    applyRendererStyle: applySceneRendererStyle,
    setRendererSelection: setSceneRendererSelection,
    generateRendererSurfObj: generateSceneSurfObj,
    createRendererGroup: createSceneRendererGroup,
    changeRendererType: changeSceneRendererType,
    createRendererOnObject: createSceneRendererOnObject,
    moveSceneNode,
    bulkSetNodeVisible: bulkSceneSetVisible,
    bulkDeleteNodes: bulkSceneDelete,
    setSceneBackgroundColor: setSceneBgColorFromCtx,
    toggleSceneColorProofing: toggleSceneColorProofingFromCtx,
    createStyleSet: createSceneStyleSet,
    toggleStyleSetReadOnly: toggleSceneStyleReadOnly,
    loadStyleSetFromFile: loadSceneStyleFromFile,
    saveStyleSetToFile: saveSceneStyleToFile,
    saveStyleSetToCurrentSrc: saveSceneStyleToCurrentSrc,
    createCamera: createSceneCamera,
    renameCamera: renameSceneCamera,
    saveViewToCamera: saveViewToSceneCamera,
    applyCameraToView: applySceneCameraToView,
    clearCameraVisFlags: clearSceneCameraVisFlags,
    loadCameraFromFile: loadSceneCameraFromFile,
    saveCameraToFile: saveSceneCameraToFile,
    saveCameraToCurrentSrc: saveSceneCameraToCurrentSrc,
    reloadCameraFromSrc: reloadSceneCameraFromSrc,
    fetchNodeInfo: fetchSceneNodeInfo,
    resolveNodeName,
  } = useSceneTree({ cm, sceneId: activeSceneId });

  const {
    inspectorOpen,
    rendererProps,
    genericProps,
    inspectorInfo,
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
    handleCloseTab,
    handleReorderTabs,
  } = useTabManager({ onMolViewClose: handleMolViewClose, confirmCloseTab });

  useQuitHandler({ tabsRef, handleCloseTab, setActiveTab });

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

  // --- Scene-tree toolbar handlers (UXP workspace_panel onBtn*Cmd) ---
  const showNodePropertyDialog = useShowNodePropertyDialog();

  const handleSceneFocus = useCallback((id: string) => {
    if (activeMolViewId === undefined) return;
    focusSceneNode(activeMolViewId, id).catch((err: unknown) => {
      console.warn('focusSceneNode failed:', err);
    });
  }, [activeMolViewId, focusSceneNode]);

  const handleSceneDelete = useCallback((id: string) => {
    deleteSceneNode(id).catch((err: unknown) => {
      console.warn('deleteSceneNode failed:', err);
    });
  }, [deleteSceneNode]);

  const handleSceneShowProperty = useCallback(async (id: string) => {
    const info = await fetchSceneNodeInfo(id);
    if (!info) return;
    await showNodePropertyDialog(info);
  }, [fetchSceneNodeInfo, showNodePropertyDialog]);

  const {
    openContextMenu: openSceneCtxMenu,
    openNewRendererFlow: openSceneNewRendererFlow,
    openNewCameraFlow: openSceneNewCameraFlow,
  } = useSceneContextMenu({
    cm,
    sceneId: activeSceneId,
    toggleVisibility: handleToggleVisibility,
    deleteNode: deleteSceneNode,
    renameNode: renameSceneNode,
    showProperty: handleSceneShowProperty,
    selectObjectMol: selectSceneObjectMol,
    copyNode: copySceneNode,
    pasteNode: pasteSceneNode,
    setRendererColoring: setSceneRendererColoring,
    paintRendererSelection: paintSceneRendererSelection,
    paintObjectSelection: paintSceneObjectSelection,
    applyRendererStyle: applySceneRendererStyle,
    setRendererSelection: setSceneRendererSelection,
    generateRendererSurfObj: generateSceneSurfObj,
    createRendererGroup: createSceneRendererGroup,
    changeRendererType: changeSceneRendererType,
    createRendererOnObject: createSceneRendererOnObject,
    selectedIds: sceneSelectedIds,
    bulkSetNodeVisible: bulkSceneSetVisible,
    bulkDeleteNodes: bulkSceneDelete,
    setSceneBackgroundColor: setSceneBgColorFromCtx,
    toggleSceneColorProofing: toggleSceneColorProofingFromCtx,
    createStyleSet: createSceneStyleSet,
    toggleStyleSetReadOnly: toggleSceneStyleReadOnly,
    loadStyleSetFromFile: loadSceneStyleFromFile,
    saveStyleSetToFile: saveSceneStyleToFile,
    saveStyleSetToCurrentSrc: saveSceneStyleToCurrentSrc,
    activeViewId: activeMolViewId,
    createCamera: createSceneCamera,
    renameCamera: renameSceneCamera,
    saveViewToCamera: saveViewToSceneCamera,
    applyCameraToView: applySceneCameraToView,
    clearCameraVisFlags: clearSceneCameraVisFlags,
    loadCameraFromFile: loadSceneCameraFromFile,
    saveCameraToFile: saveSceneCameraToFile,
    saveCameraToCurrentSrc: saveSceneCameraToCurrentSrc,
    reloadCameraFromSrc: reloadSceneCameraFromSrc,
  });

  const handleShowSceneCtxMenu = useCallback(
    (node: Parameters<typeof openSceneCtxMenu>[0], x: number, y: number) => {
      void openSceneCtxMenu(node, x, y).catch((err: unknown) => {
        console.warn('scene context menu failed:', err);
      });
    },
    [openSceneCtxMenu],
  );

  // Tree row double-click — UXP `onTreeItemClick` `aEvent.detail==2`:
  // camera rows run `loadCamImpl(name, true)` (Apply to view with vis
  // flags); other rows run `onPropCmd` (Properties dialog). The current
  // Properties dialog is still the panel-wide key/value stub (Phase 5a),
  // but UXP wires it the same way.
  const handleSceneNodeDoubleClick = useCallback(
    (node: Parameters<typeof openSceneCtxMenu>[0]) => {
      if (node.type === 'camera') {
        if (activeMolViewId === undefined) return;
        void applySceneCameraToView(activeMolViewId, node.name, true).catch(
          (err: unknown) => { console.warn('dblclick applyCameraToView failed:', err); },
        );
        return;
      }
      // Non-camera rows: UXP onPropCmd. cameraRoot / styleRoot have no
      // property action (UXP onPropCmd early-returns for those), so we
      // skip them. styleRoot is fine as a leaf-double-click no-op.
      if (node.type === 'cameraRoot' || node.type === 'styleRoot') return;
      void handleSceneShowProperty(String(node.id)).catch((err: unknown) => {
        console.warn('dblclick showProperty failed:', err);
      });
    },
    [activeMolViewId, applySceneCameraToView, handleSceneShowProperty],
  );

  // Inline-rename commit: identical routing to the ctxmenu 'rename'
  // case in useSceneContextMenu — camera rows go through renameCamera
  // (cameras have no in-place name setter once registered), everything
  // else through the generic renameNode worker.
  const handleCommitInlineRename = useCallback(
    (node: Parameters<typeof openSceneCtxMenu>[0], newName: string) => {
      if (node.type === 'camera') {
        void renameSceneCamera(node.name, newName).catch((err: unknown) => {
          console.warn('inline rename camera failed:', err);
        });
      } else {
        void renameSceneNode(String(node.id), newName).catch((err: unknown) => {
          console.warn('inline rename failed:', err);
        });
      }
    },
    [renameSceneCamera, renameSceneNode],
  );

  // Toolbar Add button — UXP `onNewCmd` dispatches by selected row type:
  // object / renderer / rendGroup → New Renderer flow;
  // camera / cameraRoot → New Camera flow (createCamera + saveViewToCam).
  // Other selections produce a no-op.
  const handleSceneAdd = useCallback(() => {
    const numId = Number(sceneSelected);
    if (!Number.isFinite(numId)) return;
    const walk = (n: typeof sceneTree): typeof sceneTree => {
      if (!n) return null;
      if (n.id === numId) return n;
      for (const c of n.children) {
        const found = walk(c);
        if (found) return found;
      }
      return null;
    };
    const node = walk(sceneTree);
    if (!node) return;
    if (node.type === 'camera' || node.type === 'cameraRoot') {
      void openSceneNewCameraFlow().catch((err: unknown) => {
        console.warn('new-camera toolbar add failed:', err);
      });
      return;
    }
    void openSceneNewRendererFlow(node).catch((err: unknown) => {
      console.warn('new-renderer toolbar add failed:', err);
    });
  }, [sceneSelected, sceneTree, openSceneNewRendererFlow, openSceneNewCameraFlow]);

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
    newScene,
  });

  // --- Sample data ---
  const [alignment] = useState<AlignmentData | null>(SAMPLE_ALIGNMENT);
  const [animation] = useState<AnimationData | null>(SAMPLE_ANIMATION);

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
        <MenuBar activeTab={activeTab} viewProjection={viewProjection} viewCenterMark={viewCenterMark} sceneBgColor={sceneBgColor} />
      )}
      <Toolbar
        onOpenFile={() => dispatchCommand(CmdId.UiOpenObjDialog).catch((e: unknown) => console.error('UiOpenObjDialog failed:', e))}
        onNewTab={() => dispatchCommand(CmdId.TabNew).catch((e: unknown) => console.error('TabNew failed:', e))}
        onSave={() => dispatchCommand(CmdId.FileSave).catch((e: unknown) => console.error('FileSave failed:', e))}
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
                    sceneTree={sceneTree}
                    sceneSelected={sceneSelected}
                    sceneSelectedIds={sceneSelectedIds}
                    onSceneSelect={setSceneSelected}
                    onSceneToggleSelect={toggleSceneSelected}
                    onToggleVisibility={handleToggleVisibility}
                    onShowProperty={handleSceneShowProperty}
                    onFocusSelected={handleSceneFocus}
                    onDeleteSelected={handleSceneDelete}
                    onAddSelected={handleSceneAdd}
                    onSceneNodeDoubleClick={handleSceneNodeDoubleClick}
                    onCommitInlineRename={handleCommitInlineRename}
                    onShowSceneContextMenu={handleShowSceneCtxMenu}
                    onMoveSceneNode={moveSceneNode}
                    sceneOpsEnabled={sceneOpsEnabled}
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
