/**
 * @file components/panels/PanelTabButton.tsx
 * @description Tab button for a panel tab strip.
 *
 * Shared by every panel that has one (the main window's BottomPanel, the
 * Rendering window's RenderPanel) so the strips stay pixel-identical: the
 * styling lives entirely in the `.bottom-panel-tabs` / `.bottom-tab` rules,
 * and no caller re-creates the markup.
 */

import React from "react";
import { AppIcon } from "../AppIcon";
import type { AppIconKey } from "../../data/appIcons";

export interface PanelTabButtonProps<T extends string> {
  /** Value this tab selects. */
  tab: T;
  /** Currently selected value. */
  activeTab: T;
  icon: AppIconKey;
  label: string;
  onClick: (tab: T) => void;
}

/**
 * One tab in a panel tab strip. Generic over the tab-id union so `onClick`
 * is typed without a cast.
 */
export function PanelTabButton<T extends string>({
  tab,
  activeTab,
  icon,
  label,
  onClick,
}: PanelTabButtonProps<T>): React.JSX.Element {
  return (
    <div
      className={`bottom-tab ${activeTab === tab ? "active" : ""}`}
      onClick={() => onClick(tab)}
    >
      <AppIcon name={icon} size="md" className="tab-icon" aria-hidden />
      <span className="tab-label">{label}</span>
    </div>
  );
}
