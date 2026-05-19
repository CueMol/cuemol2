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
import { Icon } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import type { TabData } from "../types";
import type { DropTarget, TabDragDropAPI } from "../hooks/useTabDragDrop";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export const TabBar: React.FC<TabBarProps> = ({
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
            /* ── Drag & Drop attributes ── */
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
            {/* Per-type icon: home / cog / cube / media — one icon per tab. */}
            <Icon
              icon={tab.icon as IconName}
              size={14}
              className="tab-icon"
            />
            <span className="tab-title">{tab.title}</span>
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              <Icon icon="small-cross" size={14} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
