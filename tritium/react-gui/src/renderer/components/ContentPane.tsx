/**
 * Content pane of the content area panel.
 *
 * Renders the content appropriate for the active tab's type:
 *
 * | Tab type        | Rendered component                    |
 * |-----------------|---------------------------------------|
 * | `"settings"`    | `SettingsPane` (app settings)         |
 * | `"molview"`     | `MolViewPane` (WebGL canvas)          |
 * | `"codeview"`    | `CodeViewPane` or `WelcomePane`       |
 * | none / no file  | `WelcomePane`                         |
 *
 * MolViewPane is kept permanently mounted to preserve the WebGL context and
 * OffscreenCanvas binding. It is hidden with `display:none` when another
 * tab is active (display-toggle strategy).
 */

import React from "react";
import type { TabData } from "../types";
import { WelcomePane } from "./WelcomePane";
import { SettingsPane } from "./SettingsPane";
import { CodeViewPane } from "./CodeViewPane";
import { MolViewPane } from "./MolViewPane";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ContentPaneProps {
  /** All open tabs — used to detect whether a MolViewPane tab exists. */
  tabs: TabData[];
  /** The currently active tab, or `undefined` if no tab is selected. */
  activeTab: TabData | undefined;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Map a tab to its content node. Returns null for molview (handled separately). */
const renderContent = (tab: TabData | undefined): React.ReactNode => {
  if (!tab || (tab.type === "codeview" && !tab.content)) return <WelcomePane />;
  switch (tab.type) {
    case "settings": return <SettingsPane />;
    case "codeview": return (
      <div className="editor-content">
        <CodeViewPane content={tab.content!} />
      </div>
    );
    default: return <WelcomePane />;
  }
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export const ContentPane: React.FC<ContentPaneProps> = ({ tabs, activeTab }) => {
  const hasMolViewTab = tabs.some((t) => t.type === "molview");
  const molViewVisible = activeTab?.type === "molview";

  return (
    <div className="content-pane">
      {/* MolViewPane is always mounted once the tab exists; hidden when inactive.
          Using display:none rather than unmounting to preserve WebGL context
          and the OffscreenCanvas transferred to the Web Worker. */}
      {hasMolViewTab && (
        <div style={{ display: molViewVisible ? "flex" : "none", flexDirection: "column", height: "100%" }}>
          <MolViewPane />
        </div>
      )}
      {!molViewVisible && renderContent(activeTab)}
    </div>
  );
};
