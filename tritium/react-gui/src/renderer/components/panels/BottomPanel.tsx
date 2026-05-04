/**
 * Bottom panel with VSCode-style tabbed switching between Output,
 * Sequence alignment, and Animation timeline views.
 *
 * The Output tab uses `LogView` (pre-element based) backed by
 * `useLogEvent` so it receives cuemol3 core log events via IPC.
 */

import React, { useState } from "react";
import { Icon } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { LogView } from "../../LogView";
import { SequencePanel } from "./SequencePanel";
import { AnimationPanel } from "./AnimationPanel";
import type { AlignmentData, AnimationData } from "../../types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type BottomTabType = "output" | "sequence" | "animation";

interface TabButtonProps {
  tab: BottomTabType;
  activeTab: BottomTabType;
  icon: IconName;
  label: string;
  onClick: (tab: BottomTabType) => void;
}

// ─────────────────────────────────────────────
// Sub-component: TabButton
// ─────────────────────────────────────────────

const TabButton: React.FC<TabButtonProps> = ({ tab, activeTab, icon, label, onClick }) => (
  <div
    className={`bottom-tab ${activeTab === tab ? "active" : ""}`}
    onClick={() => onClick(tab)}
  >
    <Icon icon={icon} size={14} className="tab-icon" />
    <span className="tab-label">{label}</span>
  </div>
);

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

interface BottomPanelProps {
  alignment: AlignmentData | null;
  animation: AnimationData | null;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({ alignment, animation }) => {
  const [activeTab, setActiveTab] = useState<BottomTabType>("output");

  const renderContent = () => {
    switch (activeTab) {
      case "output":
        return <LogView />;
      case "sequence":
        return <SequencePanel alignment={alignment} />;
      case "animation":
        return <AnimationPanel animation={animation} />;
    }
  };

  return (
    <div className="bottom-panel">
      <div className="bottom-panel-tabs">
        <TabButton tab="output" activeTab={activeTab} icon="console" label="Output" onClick={setActiveTab} />
        <TabButton tab="sequence" activeTab={activeTab} icon="align-left" label="Sequence" onClick={setActiveTab} />
        <TabButton tab="animation" activeTab={activeTab} icon="timeline-events" label="Animation" onClick={setActiveTab} />
      </div>
      <div className="bottom-panel-content">{renderContent()}</div>
    </div>
  );
};
