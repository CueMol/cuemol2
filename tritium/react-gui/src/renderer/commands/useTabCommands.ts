/**
 * @file commands/useTabCommands.ts
 * @description Registers tab management commands (close, Settings tab).
 * CmdId.TabNew is handled by useNewTabCommand.
 */

import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'

interface UseTabCommandsOptions {
    handleCloseTab: (id: string) => Promise<boolean>
    /** Open the Settings tab, or activate it when it is already open. */
    openSettingsTab: () => void
}

export function useTabCommands({ handleCloseTab, openSettingsTab }: UseTabCommandsOptions): void {
    useRegisterCommand(CmdId.TabClose, (id: string | undefined) => {
        if (id) {
            handleCloseTab(id).catch((e: unknown) => console.error('TabClose failed:', e));
        }
    })

    // macOS App > Preferences... and the non-macOS Edit > Options both land
    // here: settings live in a singleton editor tab, not a modal, so opening
    // and re-activating are the same action.
    useRegisterCommand(CmdId.UiSettingsTab, () => {
        openSettingsTab()
    })
}
