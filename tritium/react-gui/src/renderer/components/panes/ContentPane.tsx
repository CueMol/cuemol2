/**
 * Content pane of the content area panel.
 *
 * Renders the content appropriate for the active tab's type:
 *
 * | Tab type        | Rendered component                    |
 * |-----------------|---------------------------------------|
 * | `"settings"`    | `SettingsPane` (app settings)         |
 * | `"molview"`     | `MolViewPane` (WebGL canvas)          |
 * | `"codeview"`    | `CodeViewPane` or `WelcomePane`       |
 * | none / no file  | `WelcomePane`                         |
 *
 * MolViewPane is kept permanently mounted to preserve the WebGL context and
 * OffscreenCanvas binding. It is hidden with `display:none` when another
 * tab is active (display-toggle strategy).
 */

import React, { useCallback, useRef } from "react";
import type { TabData } from "../../types";
import type { ToolId } from "../../data/viewportTools";
import { WelcomePane } from "./WelcomePane";
import { SettingsPane } from "./SettingsPane";
import { CodeViewPane } from "./CodeViewPane";
import { MolViewPane } from "./MolViewPane";
import { ViewportToolPalette } from "../ViewportToolPalette";
import { useNaviClickHandler } from "../../hooks/useNaviClickHandler";
import { useNaviContextMenu } from "../../hooks/useNaviContextMenu";
import type { HitTestResult } from "../../types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

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
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Map a tab to its content node. Returns null for molview (handled separately). */
const renderContent = (tab: TabData | undefined): React.ReactNode => {
  if (!tab || (tab.type === "codeview" && !tab.content)) return <WelcomePane />;
  switch (tab.type) {
    case "settings": return <SettingsPane />;
    case "codeview": return (
      <div className="editor-content">
        <CodeViewPane content={tab.content!} />
      </div>
    );
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
}) => {
  const hasMolViewTab = tabs.some((t) => t.type === "molview");
  const molViewVisible = activeTab?.type === "molview";
  const showPalette = activeTab?.type !== "settings";

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

  useNaviClickHandler({ setStatusMessage: onStatusMessage ?? (() => {}), openContextMenu });

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
      {!molViewVisible && renderContent(activeTab)}
      {showPalette && (
        <ViewportToolPalette activeTool={activeTool} onSelect={onSelectTool} />
      )}
    </div>
  );
};
