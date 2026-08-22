/**
 * @file components/Toolbar.tsx
 * @description Top window toolbar (Navbar). Ports the non-tool buttons of the
 * UXP ribbon Home tab into a single, tab-less Navbar.
 *
 * Buttons are defined declaratively in `TOOLBAR_ITEMS`. Real buttons dispatch
 * through the renderer-internal command bus (`useCommands().dispatch`).
 */

import React, { useRef } from "react";
import { Button, Divider, Navbar, Alignment } from "@blueprintjs/core";

import { useCommands } from "../commands/CommandRegistry";
import { CmdId } from "../commands/ids";
import { useCollapsibleLabels } from "../hooks/useCollapsibleLabels";
import { Tooltip } from "../h3-kit/Tooltip";
import { UndoRedoSplitButton } from "./toolbar/UndoRedoSplitButton";
import { AppIcon } from "./AppIcon";
import type { AppIconKey } from "../data/appIcons";
import type { UndoRedoState } from "../hooks/useUndoRedoState";

type ToolbarItem =
  | { kind: "cmd"; id: string; icon: AppIconKey; text: string; cmd: CmdId; requiresScene?: boolean }
  | { kind: "divider"; id: string }
  | { kind: "undo"; id: string }
  | { kind: "redo"; id: string };

const TOOLBAR_ITEMS: ToolbarItem[] = [
  { kind: "cmd", id: "new-tab", icon: "toolbar.newTab", text: "New Tab", cmd: CmdId.TabNew },
  { kind: "divider", id: "d1" },
  { kind: "cmd", id: "open-file", icon: "toolbar.openFile", text: "Open File", cmd: CmdId.UiOpenObjDialog },
  { kind: "cmd", id: "save-as", icon: "toolbar.saveAs", text: "Save As", cmd: CmdId.ObjectSaveAs, requiresScene: true },
  { kind: "divider", id: "d2" },
  { kind: "cmd", id: "open-scene", icon: "toolbar.openScene", text: "Open Scene", cmd: CmdId.UiOpenSceneDialog },
  { kind: "cmd", id: "reload-scene", icon: "toolbar.reloadScene", text: "Reload Scene", cmd: CmdId.SceneReload, requiresScene: true },
  { kind: "cmd", id: "save-scene", icon: "toolbar.saveScene", text: "Save Scene", cmd: CmdId.FileSave, requiresScene: true },
  { kind: "divider", id: "d3" },
  { kind: "cmd", id: "get-pdb", icon: "toolbar.getPdb", text: "Get PDB", cmd: CmdId.UiGetPdbDialog },
  { kind: "divider", id: "d4" },
  { kind: "cmd", id: "render", icon: "toolbar.render", text: "Render", cmd: CmdId.UiRenderWindow, requiresScene: true },
  { kind: "divider", id: "d5" },
  { kind: "undo", id: "undo" },
  { kind: "redo", id: "redo" },
];

interface ToolbarProps {
  undoRedo: UndoRedoState;
  /** Whether a molview tab is active. Scene-only buttons are disabled when not. */
  hasScene: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({ undoRedo, hasScene }) => {
  const { dispatch } = useCommands();
  const barRef = useRef<HTMLDivElement>(null);
  // Collapse each label to icon-only when the toolbar is too narrow to show
  // even its ellipsis (truncation itself is CSS; see _toolbar.css). While
  // collapsed, the hidden label is shown in the shared Tooltip below.
  const collapsed = useCollapsibleLabels(barRef);

  const renderItem = (item: ToolbarItem): React.ReactNode => {
    switch (item.kind) {
      case "divider":
        return <Divider key={item.id} />;
      case "undo":
        return (
          <UndoRedoSplitButton
            key={item.id}
            kind="undo"
            canExecute={undoRedo.canUndo}
            descs={undoRedo.undoDescs}
            onPick={undoRedo.pickUndo}
            collapsed={collapsed}
          />
        );
      case "redo":
        return (
          <UndoRedoSplitButton
            key={item.id}
            kind="redo"
            canExecute={undoRedo.canRedo}
            descs={undoRedo.redoDescs}
            onPick={undoRedo.pickRedo}
            collapsed={collapsed}
          />
        );
      case "cmd":
        // Tooltip only while icon-only: a visible label needs no tooltip
        // (empty content self-disables the shared Tooltip).
        return (
          <Tooltip key={item.id} content={collapsed ? item.text : ""}>
            <Button
              minimal
              disabled={item.requiresScene === true && !hasScene}
              icon={<AppIcon name={item.icon} size={16} aria-hidden />}
              text={item.text}
              onClick={() =>
                dispatch(item.cmd).catch((e: unknown) =>
                  console.error(`${item.cmd} failed:`, e),
                )
              }
            />
          </Tooltip>
        );
    }
  };

  return (
    <div ref={barRef} className="app-toolbar-wrap">
      <Navbar className="app-toolbar" fixedToTop={false}>
        <Navbar.Group align={Alignment.LEFT}>
          {TOOLBAR_ITEMS.map(renderItem)}
        </Navbar.Group>
      </Navbar>
    </div>
  );
};
