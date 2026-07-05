/**
 * @file commands/useRenderCommands.ts
 * @description Registers rendering-related commands.
 *
 * `UiRenderWindow` opens (or focuses) the modeless Rendering window, which
 * hosts the render settings, execution controls and result viewer. The
 * window is created by the main process (RENDER_WINDOW_OPEN).
 */

import { useRegisterCommand } from "./CommandRegistry";
import { CmdId } from "./ids";
import { IPC } from "../../shared/ipcChannels";

export function useRenderCommands(): void {
  useRegisterCommand(CmdId.UiRenderWindow, () => {
    window.electronAPI?.invoke(IPC.RENDER_WINDOW_OPEN).catch((err: unknown) => {
      console.warn("open render window failed:", err);
    });
  });
}
