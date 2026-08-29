/**
 * Content pane of the content area panel.
 *
 * Renders the content appropriate for the active tab's type:
 *
 * | Tab type        | Rendered component                    |
 * |-----------------|---------------------------------------|
 * | `"settings"`    | `SettingsPane` (app settings)         |
 * | `"molview"`     | `MolViewPane` (WebGL canvas)          |
 * | none            | `WelcomePane` (empty-state watermark) |
 *
 * MolViewPane is kept permanently mounted to preserve the WebGL context and
 * OffscreenCanvas binding. It is hidden with `display:none` when another
 * tab is active (display-toggle strategy).
 */

import React, { useCallback, useRef, useState } from "react";
import type { TabData } from "../../types";
import { WelcomePane } from "./WelcomePane";
import { SettingsPane } from "./SettingsPane";
import { MolViewPane } from "./MolViewPane";
import { ViewportToolPalette } from "../ViewportToolPalette";
import { RectSelectOverlay } from "../RectSelectOverlay";
import { useNaviClickHandler } from "../../hooks/useNaviClickHandler";
import { useMeasureClickHandler } from "../../hooks/useMeasureClickHandler";
import { useBondEditClickHandler } from "../../hooks/useBondEditClickHandler";
import { useNaviContextMenu } from "../../hooks/useNaviContextMenu";
import { useActiveToolContext, useSetActiveTool } from "../../contexts/ActiveToolContext";
import { useSetStatusMessage } from "../../state/statusMessage";
import type { HitTestResult } from "../../types";

// ---------------------------------------------
// Types
// ---------------------------------------------

interface ContentPaneProps {
  /** All open tabs -- used to detect whether a MolViewPane tab exists. */
  tabs: TabData[];
  /** The currently active tab, or `undefined` if no tab is selected. */
  activeTab: TabData | undefined;
}

// ---------------------------------------------
// Helpers
// ---------------------------------------------

/** Map a tab to its content node; the no-tab empty state falls back to the
 *  WelcomePane watermark. Molview is handled separately (permanent mount). */
const renderContent = (tab: TabData | undefined): React.ReactNode => {
  if (tab?.type === "settings") return <SettingsPane />;
  return <WelcomePane />;
};

// ---------------------------------------------
// Component
// ---------------------------------------------

export const ContentPane: React.FC<ContentPaneProps> = ({
  tabs,
  activeTab,
}) => {
  // The tool and the status line are read from their owners, not passed in.
  const activeTool = useActiveToolContext();
  const onSelectTool = useSetActiveTool();
  const onStatusMessage = useSetStatusMessage();
  const hasMolViewTab = tabs.some((t) => t.type === "molview");
  // The molview canvas is visible -- and thus the viewport tools apply -- only
  // when a molview tab is active, never on Settings or the empty state.
  const molViewVisible = activeTab?.type === "molview";

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
      {!molViewVisible && renderContent(activeTab)}
      {/* Rubber-band selection layer -- click-through unless a select tool
          is active. Mounted only while the canvas is visible. */}
      {molViewVisible && <RectSelectOverlay />}
      {molViewVisible && (
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
