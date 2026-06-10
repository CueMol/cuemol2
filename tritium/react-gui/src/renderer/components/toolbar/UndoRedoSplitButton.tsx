/**
 * @file components/toolbar/UndoRedoSplitButton.tsx
 * @description Undo / Redo split-button for the top Toolbar.
 *
 * The main button performs a single-step undo/redo via the command registry.
 * The caret button opens a history dropdown -- but the worker-side service
 * that enumerates undo/redo history (getUndoSize / getUndoDesc) is not wired
 * yet, so the dropdown is a placeholder mock for now (UXP `populateUndoMenu`
 * parity is a future task).
 */

import React from "react";
import { Button, ButtonGroup, Menu, MenuItem, Popover } from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";
import { useCommands } from "../../commands/CommandRegistry";
import { CmdId } from "../../commands/ids";

interface UndoRedoSplitButtonProps {
  kind: "undo" | "redo";
}

export const UndoRedoSplitButton: React.FC<UndoRedoSplitButtonProps> = ({ kind }) => {
  const { dispatch } = useCommands();
  const isUndo = kind === "undo";
  const cmd = isUndo ? CmdId.Undo : CmdId.Redo;
  const text = isUndo ? "Undo" : "Redo";

  const runStep = (): void => {
    dispatch(cmd).catch((e: unknown) => console.error(`${cmd} failed:`, e));
  };

  // Mock dropdown: history enumeration needs a worker service that is not
  // implemented yet. Show a single disabled placeholder item.
  const historyMenu = (
    <Menu>
      <MenuItem disabled text="History (not implemented)" />
    </Menu>
  );

  return (
    <ButtonGroup minimal>
      <Button
        icon={<AppIcon name={isUndo ? "ui.undo" : "ui.redo"} aria-hidden />}
        text={text}
        onClick={runStep}
      />
      <Popover content={historyMenu} placement="bottom-start">
        <Button
          className="h3-form-dropdown-caret"
          icon={<span className="h3-form-caret" aria-hidden />}
          aria-label={`${text} history`}
        />
      </Popover>
    </ButtonGroup>
  );
};
