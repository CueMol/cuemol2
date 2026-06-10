/**
 * @file components/Toolbar.tsx
 * @description Top window toolbar (Navbar). Ports the non-tool buttons of the
 * UXP ribbon Home tab into a single, tab-less Navbar.
 *
 * Buttons are defined declaratively in `TOOLBAR_ITEMS`. Real buttons dispatch
 * through the renderer-internal command bus (`useCommands().dispatch`); mock
 * buttons are placed for layout parity but have no command backing yet
 * (object Save / Save As / Reload Scene -- see ADR-0013).
 */

import React from "react";
import { Button, Divider, Navbar, Alignment } from "@blueprintjs/core";

import { useCommands } from "../commands/CommandRegistry";
import { CmdId } from "../commands/ids";
import { UndoRedoSplitButton } from "./toolbar/UndoRedoSplitButton";
import { AppIcon } from "./AppIcon";
import type { AppIconKey } from "../data/appIcons";

type ToolbarItem =
  | { kind: "cmd"; id: string; icon: AppIconKey; text: string; cmd: CmdId }
  | { kind: "mock"; id: string; icon: AppIconKey; text: string }
  | { kind: "divider"; id: string }
  | { kind: "undo"; id: string }
  | { kind: "redo"; id: string };

const TOOLBAR_ITEMS: ToolbarItem[] = [
  { kind: "cmd", id: "new-tab", icon: "toolbar.newTab", text: "New Tab", cmd: CmdId.TabNew },
  { kind: "divider", id: "d1" },
  { kind: "cmd", id: "open-file", icon: "toolbar.openFile", text: "Open File", cmd: CmdId.UiOpenObjDialog },
  { kind: "mock", id: "save", icon: "toolbar.save", text: "Save" },
  { kind: "cmd", id: "save-as", icon: "toolbar.saveAs", text: "Save As", cmd: CmdId.ObjectSaveAs },
  { kind: "divider", id: "d2" },
  { kind: "cmd", id: "open-scene", icon: "toolbar.openScene", text: "Open Scene", cmd: CmdId.UiOpenSceneDialog },
  { kind: "cmd", id: "reload-scene", icon: "toolbar.reloadScene", text: "Reload Scene", cmd: CmdId.SceneReload },
  { kind: "cmd", id: "save-scene", icon: "toolbar.saveScene", text: "Save Scene", cmd: CmdId.FileSave },
  { kind: "divider", id: "d3" },
  { kind: "cmd", id: "get-pdb", icon: "toolbar.getPdb", text: "Get PDB", cmd: CmdId.UiGetPdbDialog },
  { kind: "divider", id: "d4" },
  { kind: "cmd", id: "render", icon: "toolbar.render", text: "Render", cmd: CmdId.UiRenderSettings },
  { kind: "divider", id: "d5" },
  { kind: "undo", id: "undo" },
  { kind: "redo", id: "redo" },
];

export const Toolbar: React.FC = () => {
  const { dispatch } = useCommands();

  const renderItem = (item: ToolbarItem): React.ReactNode => {
    switch (item.kind) {
      case "divider":
        return <Divider key={item.id} />;
      case "undo":
      case "redo":
        return <UndoRedoSplitButton key={item.id} kind={item.kind} />;
      case "cmd":
        return (
          <Button
            key={item.id}
            minimal
            icon={<AppIcon name={item.icon} size={16} aria-hidden />}
            text={item.text}
            onClick={() =>
              dispatch(item.cmd).catch((e: unknown) =>
                console.error(`${item.cmd} failed:`, e),
              )
            }
          />
        );
      case "mock":
        // Placeholder: command not implemented yet (see ADR-0013).
        return (
          <Button
            key={item.id}
            minimal
            icon={<AppIcon name={item.icon} size={16} aria-hidden />}
            text={item.text}
            onClick={() =>
              console.warn(`[Toolbar] "${item.text}" is not implemented yet`)
            }
          />
        );
    }
  };

  return (
    <Navbar className="app-toolbar" fixedToTop={false}>
      <Navbar.Group align={Alignment.LEFT}>
        {TOOLBAR_ITEMS.map(renderItem)}
      </Navbar.Group>
    </Navbar>
  );
};
