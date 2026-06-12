/**
 * Content pane of the content area panel.
 *
 * Renders the content appropriate for the active tab's type:
 *
 * | Tab type        | Rendered component                    |
 * |-----------------|---------------------------------------|
 * | `"welcome"`     | `WelcomePane` (start screen)          |
 * | `"settings"`    | `SettingsPane` (app settings)         |
 * | `"molview"`     | `MolViewPane` (WebGL canvas)          |
 * | none            | `WelcomePane`                         |
 *
 * MolViewPane is kept permanently mounted to preserve the WebGL context and
 * OffscreenCanvas binding. It is hidden with `display:none` when another
 * tab is active (display-toggle strategy).
 */

import React, { useCallback, useRef, useState } from "react";
import type { TabData } from "../../types";
import type { ToolId } from "../../data/viewportTools";
import type { RenderResult } from "../../data/renderResult";
import { WelcomePane } from "./WelcomePane";
import { SettingsPane } from "./SettingsPane";
import { MolViewPane } from "./MolViewPane";
import { RenderResultPane } from "./RenderResultPane";
import { ViewportToolPalette } from "../ViewportToolPalette";
import { RectSelectOverlay } from "../RectSelectOverlay";
import { useNaviClickHandler } from "../../hooks/useNaviClickHandler";
import { useMeasureClickHandler } from "../../hooks/useMeasureClickHandler";
import { useBondEditClickHandler } from "../../hooks/useBondEditClickHandler";
import { useNaviContextMenu } from "../../hooks/useNaviContextMenu";
import type { HitTestResult } from "../../types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Render-result tab callbacks routed down from App. */
interface RenderResultActions {
  onReRender: (result: RenderResult) => void;
  onShowSourceScene: (result: RenderResult) => void;
  onOpenSettings: () => void;
}

interface ContentPaneProps {
  /** All open tabs — used to detect whether a MolViewPane tab exists. */
  tabs: TabData[];
  /** The currently active tab, or `undefined` if no tab is selected. */
  activeTab: TabData | undefined;
  /** Currently active viewport tool. */
  activeTool: ToolId;
  /** Callback to change the active viewport tool. */
  onSelectTool: (id: ToolId) => void;
  /** Callback to push atom/pick status messages to the app status bar. */
  onStatusMessage?: (msg: string | null) => void;
  /** Render-result tab actions. */
  renderResultActions: RenderResultActions;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Map a tab to its content node. Returns null for molview (handled separately). */
const renderContent = (
  tab: TabData | undefined,
  renderResultActions: RenderResultActions,
): React.ReactNode => {
  if (!tab) return <WelcomePane />;
  switch (tab.type) {
    case "settings": return <SettingsPane />;
    case "renderResult":
      return tab.renderResult ? (
        <RenderResultPane
          result={tab.renderResult}
          onReRender={renderResultActions.onReRender}
          onShowSourceScene={renderResultActions.onShowSourceScene}
          onOpenSettings={renderResultActions.onOpenSettings}
        />
      ) : (
        <WelcomePane />
      );
    case "welcome":
    default: return <WelcomePane />;
  }
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export const ContentPane: React.FC<ContentPaneProps> = ({
  tabs,
  activeTab,
  activeTool,
  onSelectTool,
  onStatusMessage,
  renderResultActions,
}) => {
  const hasMolViewTab = tabs.some((t) => t.type === "molview");
  const molViewVisible = activeTab?.type === "molview";
  const showPalette =
    activeTab?.type !== "settings" && activeTab?.type !== "renderResult";

  // Once a molview tab has existed, keep MolViewPane mounted permanently.
  // Unmounting the canvas destroys the WebGL context and the already-transferred
  // OffscreenCanvas in the Worker. transferControlToOffscreen() is one-shot and
  // the Worker has no unbindCanvas path, so re-mounting would throw 'already bound'.
  const everHadMolViewRef = useRef(false);
  if (hasMolViewTab) everHadMolViewRef.current = true;
  const shouldRenderMolView = everHadMolViewRef.current;

  // Capture viewport mouse position on mouseup so context menu appears at cursor.
  // C++ click events carry canvas-local coords, not viewport coords.
  const lastClientPosRef = useRef({ x: 0, y: 0 });
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    lastClientPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const { openContextMenu: openNativeContextMenu } = useNaviContextMenu();

  const openContextMenu = useCallback((hit: HitTestResult, viewId: number) => {
    const { x, y } = lastClientPosRef.current;
    openNativeContextMenu(hit, viewId, x, y);
  }, [openNativeContextMenu]);

  // Measure target label-set name (defaults to "measure"): chosen in the palette
  // options popover, applied to each measure pick.
  const [measureTarget, setMeasureTarget] = useState("measure");

  useNaviClickHandler({ setStatusMessage: onStatusMessage ?? (() => {}), openContextMenu });
  useMeasureClickHandler({ setStatusMessage: onStatusMessage ?? (() => {}), target: measureTarget });
  useBondEditClickHandler({ setStatusMessage: onStatusMessage ?? (() => {}) });

  return (
    <div className="content-pane" style={{ position: "relative" }} onMouseUp={handleMouseUp}>
      {/* MolViewPane is always mounted once the tab exists; hidden when inactive.
          Using display:none rather than unmounting to preserve WebGL context
          and the OffscreenCanvas transferred to the Web Worker. */}
      {shouldRenderMolView && (
        <div style={{ display: molViewVisible ? "flex" : "none", flexDirection: "column", height: "100%" }}>
          <MolViewPane />
        </div>
      )}
      {!molViewVisible && renderContent(activeTab, renderResultActions)}
      {/* Rubber-band selection layer -- click-through unless a select tool
          is active. Mounted only while the canvas is visible. */}
      {molViewVisible && <RectSelectOverlay />}
      {showPalette && (
        <ViewportToolPalette
          activeTool={activeTool}
          onSelect={onSelectTool}
          measureTarget={measureTarget}
          onMeasureTargetChange={setMeasureTarget}
        />
      )}
    </div>
  );
};
