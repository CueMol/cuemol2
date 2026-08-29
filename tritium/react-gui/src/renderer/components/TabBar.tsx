/**
 * @file components/TabBar.tsx
 * @description Draggable tab strip rendered inside `TabPanel`.
 *
 * This is a **pure presentational component**.  All drag-and-drop state
 * and event handlers are provided by `useTabDragDrop` and passed in via
 * props.  `TabBar` is only responsible for rendering the tab elements
 * and wiring the correct handlers to each one.
 *
 * ## Responsibilities
 *
 * - Render an individual `<div class="tab">` for every entry in `tabs`.
 * - Apply the `active`, `drag-over-left`, and `drag-over-right` CSS
 *   classes based on the current selection and drop target.
 * - Forward click, drag-start, drag-over, drag-leave, drop, and
 *   drag-end events to the callbacks supplied by the parent.
 *
 * @module TabBar
 */

import React from "react";
import { AppIcon } from "./AppIcon";
import type { TabData } from "../types";
import type { DropTarget, TabDragDropAPI } from "../hooks/useTabDragDrop";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface TabBarProps {
  /** Ordered list of open tabs. */
  tabs: TabData[];

  /** Id of the currently active (selected) tab. */
  activeTab: string;

  /** Fired when the user clicks a tab to select it. */
  onSelectTab: (id: string) => void;

  /** Fired when the user clicks the close button on a tab. */
  onCloseTab: (id: string) => void;

  /** Current drop-indicator state from `useTabDragDrop`. */
  dropTarget: DropTarget | null;

  /** Drag-and-drop event handlers from `useTabDragDrop`. */
  dragDrop: Pick<
    TabDragDropAPI,
    | "handleDragStart"
    | "handleDragOver"
    | "handleDragLeave"
    | "handleDrop"
    | "handleDragEnd"
    | "handleContainerDragOver"
    | "handleContainerDrop"
  >;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Build the CSS class string for a single tab element.
 *
 * @param tab        - The tab data for this element.
 * @param activeTab  - Id of the currently selected tab.
 * @param dropTarget - Current drop-indicator position (may be null).
 */
function tabClassName(
  tab: TabData,
  activeTab: string,
  dropTarget: DropTarget | null,
): string {
  const parts = ["tab"];
  if (tab.id === activeTab) parts.push("active");
  if (dropTarget && dropTarget.id === tab.id) {
    parts.push(
      dropTarget.side === "left" ? "drag-over-left" : "drag-over-right",
    );
  }
  return parts.join(" ");
}

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

const TabBarComponent: React.FC<TabBarProps> = ({
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  dropTarget,
  dragDrop,
}) => {
  const {
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    handleContainerDragOver,
    handleContainerDrop,
  } = dragDrop;

  return (
    <div className="tab-bar">
      <div
        className="tab-bar-scroll"
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={tabClassName(tab, activeTab, dropTarget)}
            onClick={() => onSelectTab(tab.id)}
            /* -- Drag & Drop attributes -- */
            draggable
            onDragStart={(e) => {
              onSelectTab(tab.id); // Activate on drag start (VS Code behavior)
              handleDragStart(e, tab.id);
            }}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, tab.id)}
            onDragEnd={handleDragEnd}
          >
            {/* Per-type icon: one icon per tab, keyed by tab/file type. */}
            <AppIcon name={tab.icon} size="md" className="tab-icon" aria-hidden />

            <span className="tab-title">{tab.title}</span>
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              <AppIcon name="ui.close" size="md" aria-hidden />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * The tab strip re-renders for its own props; a drag over it does not
 * reach the panes.
 */
export const TabBar = React.memo(TabBarComponent)
TabBar.displayName = 'TabBar'
