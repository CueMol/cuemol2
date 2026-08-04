/**
 * @file commands/useRenderCommands.ts
 * @description Registers rendering-related commands.
 *
 * All three open (or focus) the modeless Rendering window, which hosts the
 * render settings, execution controls and result viewer. The window is
 * created by the main process (RENDER_WINDOW_OPEN).
 *
 * `UiRenderWindow` leaves the window's output mode alone (Toolbar "Render"
 * button, Window > Rendering Window). The Rendering menu's two entries pin a
 * mode as well: Image rendering -> "still", Movie rendering -> "movie".
 */

import { useRegisterCommand } from "./CommandRegistry";
import { CmdId } from "./ids";
import { IPC } from "../../shared/ipcChannels";
import type { RenderWindowOpenOptions } from "../../shared/ipcTypes";

function openRenderWindow(opts: RenderWindowOpenOptions): void {
  window.electronAPI?.invoke(IPC.RENDER_WINDOW_OPEN, opts).catch((err: unknown) => {
    console.warn("open render window failed:", err);
  });
}

export function useRenderCommands(): void {
  useRegisterCommand(CmdId.UiRenderWindow, () => {
    openRenderWindow({});
  });
  useRegisterCommand(CmdId.UiRenderWindowImage, () => {
    openRenderWindow({ mode: "still" });
  });
  useRegisterCommand(CmdId.UiRenderWindowMovie, () => {
    openRenderWindow({ mode: "movie" });
  });
}
