/**
 * @file commands/useRenderCommands.ts
 * @description Registers rendering-related commands.
 *
 * Phase 1 wires only `UiRenderSettings`, which opens the Render Settings
 * editor in the Inspector. Render execution commands are added in later
 * phases (BottomPanel Render tab).
 */

import { useRegisterCommand } from "./CommandRegistry";
import { CmdId } from "./ids";

export function useRenderCommands(opts: {
  /** Open the Render Settings editor in the inspector. */
  showRenderSettings: () => void;
}): void {
  const { showRenderSettings } = opts;

  useRegisterCommand(CmdId.UiRenderSettings, () => {
    showRenderSettings();
  });
}
