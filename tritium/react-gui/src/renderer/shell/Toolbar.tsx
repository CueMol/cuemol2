/**
 * @file shell/Toolbar.tsx
 * @description Top window toolbar (Navbar). Ports the non-tool buttons of the
 * UXP ribbon Home tab into a single, tab-less Navbar.
 *
 * Buttons are defined declaratively in `TOOLBAR_ITEMS`. Real buttons dispatch
 * through the renderer-internal command bus. A plugin adds its own buttons by
 * declaring them in its manifest; each contributed group is drawn behind a
 * divider, the way the built-in groups are separated.
 */

import React, { useMemo, useRef } from "react";
import { Button, Divider, Navbar, Alignment } from "@blueprintjs/core";
import { useUndoRedo } from '@renderer/state/undoRedo';
import { useActiveScene } from '@renderer/state/workspace';

import { useCommands } from "@renderer/commands/CommandRegistry";
import type { CommandKey } from "@renderer/commands/CommandMap";
import { CmdId } from "@renderer/commands/ids";
import { usePluginContributions } from "@renderer/plugin-host";
import type { PluginToolbarContribution } from "@renderer/plugin-host";
import { useCollapsibleLabels } from "@renderer/hooks/react/useCollapsibleLabels";
import { Tooltip, AppIcon } from "@renderer/h3-kit/primitives";
import type { AppIconKey } from "@renderer/h3-kit/primitives";
import { UndoRedoSplitButton } from "@renderer/shell/toolbar/UndoRedoSplitButton";

type ToolbarItem =
  | {
      kind: "cmd";
      id: string;
      icon: AppIconKey;
      text: string;
      /** A built-in command id, or a plugin one for a contributed button. */
      cmd: CommandKey | string;
      requiresScene?: boolean;
    }
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
  { kind: "divider", id: "d4" },
  { kind: "cmd", id: "render", icon: "toolbar.render", text: "Render", cmd: CmdId.UiRenderWindow, requiresScene: true },
  { kind: "divider", id: "d5" },
  { kind: "undo", id: "undo" },
  { kind: "redo", id: "redo" },
];

/**
 * Splice the contributed buttons into the static bar.
 *
 * Each group is introduced by a divider so it reads as its own section, and a
 * group whose anchor is missing goes to the end rather than disappearing.
 */
export function buildToolbarItems(
  base: readonly ToolbarItem[],
  contribs: readonly PluginToolbarContribution[],
): ToolbarItem[] {
  let items = [...base];
  for (const contrib of contribs) {
    if (contrib.items.length === 0) continue;
    const block: ToolbarItem[] = [
      { kind: "divider", id: `divider-${contrib.items[0].id}` },
      ...contrib.items.map((item): ToolbarItem => ({
        kind: "cmd",
        id: item.id,
        icon: item.icon,
        text: item.text,
        cmd: item.command,
        requiresScene: item.requiresScene,
      })),
    ];
    const at = contrib.after ? items.findIndex((i) => i.id === contrib.after) : -1;
    items = at < 0
      ? [...items, ...block]
      : [...items.slice(0, at + 1), ...block, ...items.slice(at + 1)];
  }
  return items;
}

const ToolbarComponent: React.FC = () => {
  const undoRedo = useUndoRedo();
  const { hasScene } = useActiveScene();
  const { dispatchAny } = useCommands();
  const { toolbar } = usePluginContributions();
  const items = useMemo(() => buildToolbarItems(TOOLBAR_ITEMS, toolbar), [toolbar]);
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
                dispatchAny(item.cmd).catch((e: unknown) =>
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
          {items.map(renderItem)}
        </Navbar.Group>
      </Navbar>
    </div>
  );
};

/**
 * Props-free: re-renders only for the active tool and the undo/redo
 * availability it reads, never because the shell re-rendered.
 */
export const Toolbar = React.memo(ToolbarComponent)
Toolbar.displayName = 'Toolbar'
