/**
 * @file ActivityBar.tsx
 * @description VS Code-style vertical activity bar that sits at the far left
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
import { AppIcon } from "@renderer/h3-kit/primitives";
import type { AppIconKey } from "@renderer/h3-kit/primitives";
import { useWorkspaceDispatch, useWorkspaceTabs } from "@renderer/state/workspace";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/** Identifiers for the sidebar views toggled by the activity bar. */
export type ActivityView = "explorer" | "selection" | "crystal" | "catalog";

interface ActivityItemDef {
  id: ActivityView;
  icon: AppIconKey;
  label: string;
}

/**
 * Build the ordered list of activity-bar buttons rendered top-to-bottom.
 *
 * @param devUi - Whether developer-only views are part of this build. The
 *   Component Catalog is a design-review showcase, so it is present in
 *   developer builds only; see `__DEV_UI__` in electron.vite.config.ts.
 * @returns The buttons in top-to-bottom order.
 */
export const buildActivityItems = (devUi: boolean): ActivityItemDef[] => [
  { id: "explorer", icon: "activity.explorer", label: "Explorer" },
  { id: "selection", icon: "activity.selection", label: "Selection" },
  { id: "crystal", icon: "activity.crystal", label: "Crystal" },
  ...(devUi
    ? [{ id: "catalog", icon: "activity.catalog", label: "Component Catalog" } as ActivityItemDef]
    : []),
];

/** Ordered list of activity-bar buttons rendered top-to-bottom. */
const ITEMS: ActivityItemDef[] = buildActivityItems(__DEV_UI__);

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

interface ActivityBarProps {
  /** Currently active sidebar view, or `null` when the sidebar is hidden. */
  activeView: ActivityView | null;
  /** Callback to set the active view (toggle logic handled by parent). */
  onSelect: (view: ActivityView) => void;
}

const ActivityBarComponent: React.FC<ActivityBarProps> = ({
  activeView,
  onSelect,
}) => {
  // The Settings gear is a workspace tab: open / activate it, and light up
  // while it is in front.
  const { openSettingsTab } = useWorkspaceDispatch();
  const settingsActive = useWorkspaceTabs().activeTab?.type === "settings";
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
            onClick={openSettingsTab}
          >
            <AppIcon name="activity.settings" size={20} weight="bold" aria-hidden />
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

/**
 * `onSelect` is stable and `activeView` changes only when the user picks
 * a view, so this re-renders only for its own workspace slice.
 */
export const ActivityBar = React.memo(ActivityBarComponent)
ActivityBar.displayName = 'ActivityBar'
