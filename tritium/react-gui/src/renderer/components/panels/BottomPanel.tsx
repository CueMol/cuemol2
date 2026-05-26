/**
 * Bottom panel with VSCode-style tabbed switching between Output,
 * Sequence alignment, Animation timeline and Render views.
 *
 * The Output tab renders `LogPanel` (pre-element based). The log
 * subscription (`useLogEvent`) and accumulated buffer live here, not
 * inside `LogPanel`, so that switching to another tab does not unmount
 * the buffer or drop incoming messages from the cuemol3 core.
 */

import React, { useCallback, useState } from "react";
import { Icon } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { LogPanel } from "./LogPanel";
import { SequencePanel } from "./SequencePanel";
import { AnimationPanel } from "./AnimationPanel";
import { RenderPanel } from "./RenderPanel";
import { useLogEvent } from "../../hooks/useLogEvent";
import { IPC } from "../../../shared/ipcChannels";
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

  // Keep the log buffer and Output-tab UI state in the always-mounted
  // BottomPanel so they survive tab switches; LogPanel itself is unmounted
  // when another tab is active.
  const [logContents, setLogContents] = useState("");
  const [logFilter, setLogFilter] = useState("");
  const [logAutoScroll, setLogAutoScroll] = useState(true);
  useLogEvent((msg) => setLogContents((c) => c + msg));

  const handleClearLog = useCallback(() => setLogContents(""), []);
  const handleToggleAutoScroll = useCallback(() => setLogAutoScroll((v) => !v), []);
  const handleSaveLogAs = useCallback(async () => {
    // Save the unfiltered buffer so downstream readers get the full
    // debugging trail regardless of the current Filter input.
    const res = await window.electronAPI.invoke(IPC.SAVE_TEXT_AS, {
      defaultName: "output.log",
      content: logContents,
    });
    if (res.error) {
      console.error("Save Output As failed:", res.error);
    }
  }, [logContents]);

  const renderContent = () => {
    switch (activeTab) {
      case "output":
        return (
          <LogPanel
            contents={logContents}
            filter={logFilter}
            autoScroll={logAutoScroll}
            onFilterChange={setLogFilter}
            onAutoScrollToggle={handleToggleAutoScroll}
            onClear={handleClearLog}
            onSaveAs={handleSaveLogAs}
          />
        );
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
