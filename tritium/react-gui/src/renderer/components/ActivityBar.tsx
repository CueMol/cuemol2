/**
 * @file ActivityBar.tsx
 * @description VS Code–style vertical activity bar that sits at the far left
 * of the application window.  Each icon toggles a different sidebar view.
 *
 * The bar supports collapsing: clicking the already-active icon will hide
 * the sidebar entirely; clicking it again (or any other icon) re-opens it.
 *
 * The bottom section contains a gear icon that opens the Settings tab
 * in the content area.
 *
 * @module ActivityBar
 */

import React from "react";
import { Tooltip } from "@blueprintjs/core";
import { AppIcon } from "./AppIcon";
import type { AppIconKey } from "../data/appIcons";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/** Identifiers for the sidebar views toggled by the activity bar. */
export type ActivityView = "explorer" | "selection" | "crystal" | "catalog";

interface ActivityItemDef {
  id: ActivityView;
  icon: AppIconKey;
  label: string;
}

/** Ordered list of activity-bar buttons rendered top-to-bottom. */
const ITEMS: ActivityItemDef[] = [
  { id: "explorer", icon: "activity.explorer", label: "Explorer" },
  { id: "selection", icon: "activity.selection", label: "Selection" },
  { id: "crystal", icon: "activity.crystal", label: "Crystal" },
  { id: "catalog", icon: "activity.catalog", label: "Component Catalog" },
];

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

interface ActivityBarProps {
  /** Currently active sidebar view, or `null` when the sidebar is hidden. */
  activeView: ActivityView | null;
  /** Callback to set the active view (toggle logic handled by parent). */
  onSelect: (view: ActivityView) => void;
  /** Called when the user clicks the Settings gear icon. */
  onSettingsClick?: () => void;
  /** Whether the Settings tab is currently the active tab. */
  settingsActive?: boolean;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeView,
  onSelect,
  onSettingsClick,
  settingsActive,
}) => {
  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {ITEMS.map((item) => (
          <Tooltip key={item.id} content={item.label} placement="right" compact>
            <div
              className={`activity-bar-item ${activeView === item.id ? "active" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <AppIcon name={item.icon} size={22} weight="bold" aria-hidden />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="activity-bar-bottom">
        <Tooltip content="Settings" placement="right" compact>
          <div
            className={`activity-bar-item ${settingsActive ? "active" : ""}`}
            onClick={onSettingsClick}
          >
            <AppIcon name="activity.settings" size={20} weight="bold" aria-hidden />
          </div>
        </Tooltip>
      </div>
    </div>
  );
};
