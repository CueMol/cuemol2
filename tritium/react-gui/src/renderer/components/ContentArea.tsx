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
 * |  (MolViewPane / SettingsPane / WelcomePane) |
 * +---------------------------------------------+
 * ```
 *
 * The tab list and the active tab come from the workspace provider
 * (state/workspace); `ContentArea` holds no tab-management state of its own.
 *
 * @module ContentArea
 */

import React from "react";
import { useTabDragDrop } from "../hooks/useTabDragDrop";
import { useWorkspaceDispatch, useWorkspaceTabs } from "../state/workspace";
import { TabBar } from "./TabBar";
import { ContentPane } from "./panes/ContentPane";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------


// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export const ContentArea: React.FC = () => {
  const { tabs, activeTabId: activeTab, activeTab: active } = useWorkspaceTabs();
  const { activateTab: onSelectTab, closeTab: onCloseTab, reorderTabs } = useWorkspaceDispatch();

  const { dropTarget, ...dragDropHandlers } = useTabDragDrop(
    tabs,
    reorderTabs,
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
      />
    </div>
  );
};
