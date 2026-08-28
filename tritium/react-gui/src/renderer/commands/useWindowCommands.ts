/**
 * @file commands/useWindowCommands.ts
 * @description Registers the Window-menu commands that switch which app
 * window is in front.
 *
 * `WindowFocusMain` raises the main window (WINDOW_FOCUS_MAIN). The Rendering
 * window's counterpart is `UiRenderWindow` in useRenderCommands, which opens
 * the window when it is not up yet and focuses it otherwise.
 *
 * Both commands run in the main window's renderer even when the Rendering
 * window is the focused one: the native menu always delivers to the main
 * window's webContents, which then invokes back into the main process.
 */

import { useRegisterCommand } from "./CommandRegistry";
import { CmdId } from "./ids";
import { IPC } from "@shared/ipcChannels";

export function useWindowCommands(): void {
  useRegisterCommand(CmdId.WindowFocusMain, () => {
    window.electronAPI?.invoke(IPC.WINDOW_FOCUS_MAIN).catch((err: unknown) => {
      console.warn("focus main window failed:", err);
    });
  });
}
