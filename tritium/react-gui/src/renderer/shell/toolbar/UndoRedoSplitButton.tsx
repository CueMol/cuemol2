/**
 * @file components/toolbar/UndoRedoSplitButton.tsx
 * @description Undo / Redo split-button for the top Toolbar.
 *
 * The main button performs a single-step undo/redo via the command registry
 * (so it shares the Cmd+Z / Cmd+Shift+Z path). It is disabled when there is
 * nothing to undo/redo. The caret button opens a history dropdown listing the
 * transaction descriptions (index 0 = most recent); picking entry `i` jumps
 * `i+1` steps via `onPick(i)`. Mirrors UXP `populateUndoMenu` / `popupUndo`.
 *
 * State (availability + descriptions) is owned by `hooks/useUndoRedoState.ts`
 * and threaded down through `Toolbar`.
 */

import React from "react";
import { Button, ButtonGroup, Menu, MenuItem, Popover } from "@blueprintjs/core";
import { AppIcon, Tooltip } from "@renderer/h3-kit/primitives";
import { useCommands } from "@renderer/commands/CommandRegistry";
import { CmdId } from "@renderer/commands/ids";

interface UndoRedoSplitButtonProps {
  kind: "undo" | "redo";
  /** Whether a single-step undo/redo is currently possible. */
  canExecute: boolean;
  /** Transaction descriptions, index 0 = most recent. */
  descs: string[];
  /** Jump `depth+1` steps (depth = the picked entry's index). */
  onPick: (depth: number) => void;
  /** Whether the toolbar has collapsed labels to icon-only (drives the tooltip). */
  collapsed?: boolean;
}

export const UndoRedoSplitButton: React.FC<UndoRedoSplitButtonProps> = ({
  kind,
  canExecute,
  descs,
  onPick,
  collapsed = false,
}) => {
  const { dispatch } = useCommands();
  const isUndo = kind === "undo";
  const cmd = isUndo ? CmdId.Undo : CmdId.Redo;
  const text = isUndo ? "Undo" : "Redo";

  const runStep = (): void => {
    dispatch(cmd).catch((e: unknown) => console.error(`${cmd} failed:`, e));
  };

  const historyMenu = (
    <Menu>
      {descs.map((d, i) => (
        <MenuItem key={i} text={d} onClick={() => onPick(i)} />
      ))}
    </Menu>
  );

  // Only tooltip while icon-only (the visible label is otherwise enough). The
  // shared Tooltip works over the toolbar's -webkit-app-region: drag area where
  // a native `title` is suppressed. Empty content self-disables the tooltip.
  const tipContent = collapsed
    ? canExecute && descs.length > 0
      ? `${text}: ${descs[0]}`
      : text
    : "";

  return (
    <Tooltip content={tipContent}>
      <ButtonGroup minimal>
        <Button
          icon={<AppIcon name={isUndo ? "ui.undo" : "ui.redo"} aria-hidden />}
          text={text}
          disabled={!canExecute}
          onClick={runStep}
        />
        <Popover content={historyMenu} placement="bottom-start" disabled={descs.length === 0}>
          <Button
            className="h3-form-dropdown-caret"
            icon={<span className="h3-form-caret" aria-hidden />}
            aria-label={`${text} history`}
            disabled={descs.length === 0}
          />
        </Popover>
      </ButtonGroup>
    </Tooltip>
  );
};
