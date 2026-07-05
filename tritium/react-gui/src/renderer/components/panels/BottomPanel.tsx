/**
 * Bottom panel with VSCode-style tabbed switching between Output,
 * Sequence alignment and Animation timeline views. (Render execution
 * lives in the modeless Rendering window -- see RenderWindowApp.)
 *
 * The Output tab renders `LogPanel` (pre-element based). The log
 * subscription (`useLogEvent`) and accumulated buffer live here, not
 * inside `LogPanel`, so that switching to another tab does not unmount
 * the buffer or drop incoming messages from the cuemol3 core.
 */

import React, { useCallback, useState } from "react";
import { AppIcon } from "../AppIcon";
import type { AppIconKey } from "../../data/appIcons";
import { LogPanel } from "./LogPanel";
import { SequencePanel } from "./SequencePanel";
import { AnimationPanel } from "./AnimationPanel";
import { useLogEvent } from "../../hooks/useLogEvent";
import { IPC } from "../../../shared/ipcChannels";
import type { AsyncCueMol } from "../../worker/client/AsyncCueMol";

// ---------------------------------------------
// Types
// ---------------------------------------------

type BottomTabType = "output" | "sequence" | "animation";

interface TabButtonProps {
  tab: BottomTabType;
  activeTab: BottomTabType;
  icon: AppIconKey;
  label: string;
  onClick: (tab: BottomTabType) => void;
}

// ---------------------------------------------
// Sub-component: TabButton
// ---------------------------------------------

const TabButton: React.FC<TabButtonProps> = ({ tab, activeTab, icon, label, onClick }) => (
  <div
    className={`bottom-tab ${activeTab === tab ? "active" : ""}`}
    onClick={() => onClick(tab)}
  >
    <AppIcon name={icon} size="md" className="tab-icon" aria-hidden />
    <span className="tab-label">{label}</span>
  </div>
);

// ---------------------------------------------
// Main Component
// ---------------------------------------------

interface BottomPanelProps {
  cm: AsyncCueMol | null;
  /** Active scene UID; undefined when no scene is active. */
  activeSceneId: number | undefined;
  /** Active mol-view UID; required by SequencePanel "Center here". */
  activeMolViewId: number | undefined;
  /** Show / clear the anim-element detail in the Inspector (uid null = clear). */
  onInspectAnimElement?: (sceneId: number, uid: number | null) => void;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({
  cm,
  activeSceneId,
  activeMolViewId,
  onInspectAnimElement,
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
        return (
          <AnimationPanel
            cm={cm}
            activeSceneId={activeSceneId}
            activeMolViewId={activeMolViewId}
            onInspectAnimElement={onInspectAnimElement}
          />
        );
    }
  };

  return (
    <div className="bottom-panel">
      <div className="bottom-panel-tabs">
        <TabButton tab="output" activeTab={activeTab} icon="panel.output" label="Output" onClick={setActiveTab} />
        <TabButton tab="sequence" activeTab={activeTab} icon="panel.sequence" label="Sequence" onClick={setActiveTab} />
        <TabButton tab="animation" activeTab={activeTab} icon="panel.animation" label="Animation" onClick={setActiveTab} />
      </div>
      <div className="bottom-panel-content">{renderContent()}</div>
    </div>
  );
};
