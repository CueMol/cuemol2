/**
 * @file features/render/renderwindow/useRenderWindowEditKeys.ts
 * @description Undo / Redo shortcuts of the Rendering window.
 *
 * The window's settings are edits of the target scene, so Cmd+Z here means
 * the scene's undo -- unless a text field has focus, where it means the
 * typing, exactly as in the main window (utils/editClipboard.ts). The key
 * has one owner per platform, mirroring shell/keybindings:
 *
 *   - macOS: the native menu's key equivalent fires main/menu.ts, which sees
 *     this window focused and pushes RENDER_WINDOW_EDIT_PUSH instead of
 *     running a native edit it cannot route;
 *   - Windows / Linux: the native menu registers no accelerators and this
 *     window mounts no menu dispatcher, so a keydown listener here answers
 *     Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z.
 *
 * Both enter `handle`, which runs the native edit through main when a field
 * is focused and otherwise hands the action to the caller.
 */

import { useEffect, useRef } from "react";
import { IPC } from "@shared/ipcChannels";
import type { RenderWindowEditAction } from "@shared/types/renderWindow";
import { dispatchEditUndoRedo, isEditableFocused } from "@renderer/utils/editClipboard";

export type RenderWindowEdit = RenderWindowEditAction["action"];

/** The action a Windows / Linux keydown maps to, or null. */
export function editActionOfKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): RenderWindowEdit | null {
  if (!e.ctrlKey || e.metaKey || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && !e.shiftKey) return "redo";
  return null;
}

/**
 * Answer the window's Undo / Redo shortcuts.
 *
 * @param onSceneEdit - runs the action against the target scene; called only
 *   when no text field has focus
 */
export function useRenderWindowEditKeys(onSceneEdit: (action: RenderWindowEdit) => void): void {
  const onSceneEditRef = useRef(onSceneEdit);
  onSceneEditRef.current = onSceneEdit;

  useEffect(() => {
    const handle = (action: RenderWindowEdit): void => {
      // A focused field's own undo, run natively through main.
      if (dispatchEditUndoRedo(action)) return;
      onSceneEditRef.current(action);
    };

    const api = window.electronAPI;
    const offPush = api?.onPush(IPC.RENDER_WINDOW_EDIT_PUSH, ({ action }) => handle(action));

    // macOS: the native menu owns the key; a listener here would double-fire.
    if (api?.platform === "darwin") {
      return () => offPush?.();
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      const action = editActionOfKey(e);
      if (!action) return;
      // Blink's own text undo serves a focused field; only the scene undo
      // needs the key taken away from it.
      if (isEditableFocused()) return;
      e.preventDefault();
      handle(action);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      offPush?.();
    };
  }, []);
}
