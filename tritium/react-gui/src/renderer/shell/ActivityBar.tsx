/**
 * @file shell/ActivityBar.tsx
 * @description VS Code-style vertical activity bar that sits at the far left
 * of the application window.  Each icon toggles a different sidebar view.
 *
 * The bar supports collapsing: clicking the already-active icon will hide
 * the sidebar entirely; clicking it again (or any other icon) re-opens it.
 *
 * The bottom section contains a gear icon that opens the Settings tab
 * in the content area.
 *
 * Plugins contribute views of their own; those buttons follow the built-in
 * ones in registration order.
 *
 * @module ActivityBar
 */

import React, { useMemo } from "react";
import { Tooltip } from "@blueprintjs/core";
import { AppIcon } from "@renderer/h3-kit/primitives";
import type { AppIconKey } from "@renderer/h3-kit/primitives";
import { usePluginContributions } from "@renderer/plugin-host";
import type { ResolvedPluginView } from "@renderer/plugin-host";
import { useWorkspaceDispatch, useWorkspaceTabs } from "@renderer/state/workspace";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/**
 * Identifier of a sidebar view.
 *
 * A plain string rather than a union of the built-ins: a plugin names its own
 * view, and the id has to survive a round trip through the persisted layout
 * (`LayoutState.viewSizes`) of a profile where that plugin is absent.
 */
export type ActivityView = string;

interface ActivityItemDef {
  id: ActivityView;
  icon: AppIconKey;
  label: string;
}

/** The views the application itself owns, in top-to-bottom order. */
export const BUILTIN_ACTIVITY_ITEMS: readonly ActivityItemDef[] = [
  { id: "explorer", icon: "activity.explorer", label: "Explorer" },
  { id: "selection", icon: "activity.selection", label: "Selection" },
  { id: "crystal", icon: "activity.crystal", label: "Crystal" },
];

/**
 * Build the ordered list of activity-bar buttons rendered top-to-bottom.
 *
 * @param views - the enabled plugins' view contributions.
 * @returns The buttons in top-to-bottom order, built-ins first.
 */
export const buildActivityItems = (
  views: readonly ResolvedPluginView[],
): ActivityItemDef[] => [
  ...BUILTIN_ACTIVITY_ITEMS,
  ...views.map((view) => ({ id: view.id, icon: view.icon, label: view.title })),
];

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
  const { views } = usePluginContributions();
  const items = useMemo(() => buildActivityItems(views), [views]);
  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {items.map((item) => (
          <Tooltip key={item.id} content={item.label} placement="right" compact>
            <div
              className={`activity-bar-item ${activeView === item.id ? "active" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              {/* The active view's icon gains weight on top of the colour and
                  the accent bar; the rest stay at the regular outline. */}
              <AppIcon
                name={item.icon}
                size={22}
                weight={activeView === item.id ? "bold" : "regular"}
                aria-hidden
              />
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
            <AppIcon
              name="activity.settings"
              size={20}
              weight={settingsActive ? "bold" : "regular"}
              aria-hidden
            />
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
