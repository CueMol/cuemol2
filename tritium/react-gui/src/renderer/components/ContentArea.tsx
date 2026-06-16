/**
 * @file components/ContentArea.tsx
 * @description Central editor panel with a draggable tab bar and content pane.
 *
 * ## Architecture
 *
 * `ContentArea` is a thin **orchestrator** that composes three focused modules:
 *
 * | Module            | Concern                                      |
 * |-------------------|----------------------------------------------|
 * | `useTabDragDrop`  | HTML5 Drag & Drop state and event handlers   |
 * | `TabBar`          | Tab strip rendering with D&D wiring          |
 * | `ContentPane`     | Active tab content / Welcome screen fallback |
 *
 * ```
 * +---------------------------------------------+
 * |  TabBar  (draggable tabs)                   |  <- useTabDragDrop
 * +---------------------------------------------+
 * |  ContentPane                                |
 * |  (code view / ConfigPane / WelcomeScreen)   |
 * +---------------------------------------------+
 * ```
 *
 * All domain state (tab list, active tab, reorder logic) is owned by
 * the parent via props -- `ContentArea` holds no tab-management state of
 * its own.
 *
 * @module ContentArea
 */

import React from "react";
import type { TabData } from "../types";
import type { ToolId } from "../data/viewportTools";
import type { RenderResult } from "../data/renderResult";
import { useTabDragDrop } from "../hooks/useTabDragDrop";
import { TabBar } from "./TabBar";
import { ContentPane } from "./panes/ContentPane";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface ContentAreaProps {
  tabs: TabData[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  /**
   * Callback to reorder tabs via drag-and-drop.
   *
   * @param fromId      - The dragged tab id.
   * @param toId        - The drop-target tab id.
   * @param insertAfter - `true` when dropped on the right half of the target.
   */
  onReorderTabs?: (fromId: string, toId: string, insertAfter: boolean) => void;
  activeTool: ToolId;
  onSelectTool: (id: ToolId) => void;
  onStatusMessage?: (msg: string | null) => void;
  /** Re-render from a render-result tab's settings snapshot. */
  onReRender: (result: RenderResult) => void;
  /** Switch to a render-result tab's source scene. */
  onShowSourceScene: (result: RenderResult) => void;
  /** Open the Render Settings editor in the Inspector. */
  onOpenRenderSettings: () => void;
}

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export const ContentArea: React.FC<ContentAreaProps> = ({
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  activeTool,
  onSelectTool,
  onStatusMessage,
  onReRender,
  onShowSourceScene,
  onOpenRenderSettings,
}) => {
  const active = tabs.find((t) => t.id === activeTab);

  const { dropTarget, ...dragDropHandlers } = useTabDragDrop(
    tabs,
    onReorderTabs,
  );

  return (
    <div className="content-area">
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        dropTarget={dropTarget}
        dragDrop={dragDropHandlers}
      />
      <ContentPane
        tabs={tabs}
        activeTab={active}
        activeTool={activeTool}
        onSelectTool={onSelectTool}
        onStatusMessage={onStatusMessage}
        renderResultActions={{
          onReRender,
          onShowSourceScene,
          onOpenSettings: onOpenRenderSettings,
        }}
      />
    </div>
  );
};
