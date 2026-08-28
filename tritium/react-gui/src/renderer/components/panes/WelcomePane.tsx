/**
 * Empty-state watermark shown in the content area when no tab is open
 * (VSCode-like). Not a tab pane itself -- ContentPane renders it as the
 * fallback when the tab list is empty.
 *
 * Displays the app branding and the shortcuts for getting started. Both are
 * quoted from their single sources rather than retyped: the name from
 * `APP_PRODUCT_NAME`, the icon from the same asset the menu bar draws, and
 * each shortcut's label and accelerator from `APP_MENU`. This pane fell out
 * of date once already (it still said "CueMol2" and listed two shortcuts the
 * app never bound), which is what deriving them prevents.
 */

import React from "react";
import { Tag } from "@blueprintjs/core";
import appIcon from "../../assets/app-icon.png";
import { APP_PRODUCT_NAME } from "@shared/appInfo";
import { findMenuItemById } from "@shared/menuTemplate";
import { formatAccelerator } from "@shared/menuAccel";

/**
 * Menu item ids quoted on the start screen, in display order: the core
 * open/save path a new scene goes through.
 */
const SHORTCUT_IDS = ["new-tab", "open-file", "open-scene", "save-scene"];

interface Shortcut {
  id: string;
  label: string;
  accel: string;
}

/** Resolve the quoted ids to label + display accelerator, dropping any that
 *  no longer exist or lost their accelerator. */
function getShortcuts(isMac: boolean): Shortcut[] {
  return SHORTCUT_IDS.flatMap((id) => {
    const item = findMenuItemById(id);
    const accel = isMac ? item?.acceleratorMac ?? item?.accelerator : item?.accelerator;
    if (!item?.label || !accel) return [];
    return [{ id, label: item.label, accel: formatAccelerator(accel, isMac) }];
  });
}

export const WelcomePane: React.FC = () => {
  const isMac = window.electronAPI?.platform === "darwin";
  const shortcuts = getShortcuts(isMac);

  return (
    <div className="editor-placeholder">
      <img className="placeholder-app-icon" src={appIcon} alt="" aria-hidden="true" />
      <div className="placeholder-title">{APP_PRODUCT_NAME}</div>
      <div className="placeholder-subtitle">Molecular Visualization System</div>
      <div className="shortcut-group">
        {shortcuts.map((s) => (
          <div className="shortcut-item" key={s.id}>
            <Tag minimal className="shortcut-key">
              {s.accel}
            </Tag>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
