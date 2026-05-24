/**
 * Bottom panel with VSCode-style tabbed switching between Output,
 * Sequence alignment, Animation timeline and Render views.
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
import { RenderPanel } from "./RenderPanel";
import type { RenderJob } from "../../hooks/useRenderJob";
import type { AnimationData } from "../../types";
import type { AsyncCueMol } from "../../worker/client/AsyncCueMol";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type BottomTabType = "output" | "sequence" | "animation" | "render";

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
  cm: AsyncCueMol | null;
  /** Active scene UID; undefined when no scene is active. */
  activeSceneId: number | undefined;
  /** Active mol-view UID; required by SequencePanel "Center here". */
  activeMolViewId: number | undefined;
  animation: AnimationData | null;
  /** Current render job (Render tab). */
  renderJob: RenderJob | null;
  /** Selected image-size preset label. */
  renderPreset: string;
  /** Start a render. */
  onRenderStart: () => void;
  /** Cancel the active render. */
  onRenderCancel: () => void;
  /** Apply an image-size preset. */
  onRenderApplyPreset: (label: string) => void;
  /** Open the Render Settings editor in the Inspector. */
  onOpenRenderSettings: () => void;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({
  cm,
  activeSceneId,
  activeMolViewId,
  animation,
  renderJob,
  renderPreset,
  onRenderStart,
  onRenderCancel,
  onRenderApplyPreset,
  onOpenRenderSettings,
}) => {
  const [activeTab, setActiveTab] = useState<BottomTabType>("output");

  const renderContent = () => {
    switch (activeTab) {
      case "output":
        return <LogView />;
      case "sequence":
        return (
          <SequencePanel
            cm={cm}
            activeSceneId={activeSceneId}
            activeMolViewId={activeMolViewId}
          />
        );
      case "animation":
        return <AnimationPanel animation={animation} />;
      case "render":
        return (
          <RenderPanel
            job={renderJob}
            preset={renderPreset}
            onStart={onRenderStart}
            onCancel={onRenderCancel}
            onApplyPreset={onRenderApplyPreset}
            onOpenSettings={onOpenRenderSettings}
          />
        );
    }
  };

  return (
    <div className="bottom-panel">
      <div className="bottom-panel-tabs">
        <TabButton tab="output" activeTab={activeTab} icon="console" label="Output" onClick={setActiveTab} />
        <TabButton tab="sequence" activeTab={activeTab} icon="align-left" label="Sequence" onClick={setActiveTab} />
        <TabButton tab="animation" activeTab={activeTab} icon="timeline-events" label="Animation" onClick={setActiveTab} />
        <TabButton tab="render" activeTab={activeTab} icon="media" label="Render" onClick={setActiveTab} />
      </div>
      <div className="bottom-panel-content">{renderContent()}</div>
    </div>
  );
};
