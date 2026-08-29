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
import type { AppIconKey } from "../../data/appIcons";
import { PanelTabButton } from "./PanelTabButton";
import { LogPanel } from "./LogPanel";
import { SequencePanel } from "./SequencePanel";
import { AnimationPanel } from "./AnimationPanel";
import { TrajectoryPanel } from "./TrajectoryPanel";
import { useLogActions, useLogContents } from "../../contexts/LogContext";
import { IPC } from "@shared/ipcChannels";
import { useCueMol } from "../../hooks/cuemol/useCueMol";
import { useActiveScene } from "../../state/workspace";

// ---------------------------------------------
// Types
// ---------------------------------------------

type BottomTabType = "output" | "sequence" | "animation" | "trajectory";

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

const TabButton: React.FC<TabButtonProps> = (props) => (
  <PanelTabButton<BottomTabType> {...props} />
);

// ---------------------------------------------
// Main Component
// ---------------------------------------------


const BottomPanelComponent: React.FC = () => {
  const { cm } = useCueMol();
  const { activeSceneId, activeMolViewId } = useActiveScene();
  const [activeTab, setActiveTab] = useState<BottomTabType>("output");

  // The log buffer lives in LogProvider (so renderer-side code can append via
  // useLogPanel() and it survives tab switches); the Output-tab UI state stays
  // local to the always-mounted BottomPanel.
  const logContents = useLogContents();
  const { clear: clearLog } = useLogActions();
  const [logFilter, setLogFilter] = useState("");
  const [logAutoScroll, setLogAutoScroll] = useState(true);

  const handleClearLog = useCallback(() => clearLog(), [clearLog]);
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
          />
        );
      case "trajectory":
        return <TrajectoryPanel cm={cm} activeSceneId={activeSceneId} />;
    }
  };

  return (
    <div className="bottom-panel">
      <div className="bottom-panel-tabs">
        <TabButton tab="output" activeTab={activeTab} icon="panel.output" label="Output" onClick={setActiveTab} />
        <TabButton tab="sequence" activeTab={activeTab} icon="panel.sequence" label="Sequence" onClick={setActiveTab} />
        <TabButton tab="animation" activeTab={activeTab} icon="panel.animation" label="Animation" onClick={setActiveTab} />
        <TabButton tab="trajectory" activeTab={activeTab} icon="panel.trajectory" label="Trajectory" onClick={setActiveTab} />
      </div>
      <div className="bottom-panel-content">{renderContent()}</div>
    </div>
  );
};

/**
 * Props-free: re-renders for the log buffer and the active scene it
 * reads, not for anything happening in the sidebar or the inspector.
 */
export const BottomPanel = React.memo(BottomPanelComponent)
BottomPanel.displayName = 'BottomPanel'
