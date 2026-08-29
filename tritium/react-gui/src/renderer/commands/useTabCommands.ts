/**
 * @file commands/useTabCommands.ts
 * @description Registers tab management commands (close, Settings tab).
 * CmdId.TabNew is handled by useNewTabCommand.
 */

import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'

interface UseTabCommandsOptions {
    closeTab: (id: string) => Promise<boolean>
    /** Open the Settings tab, or activate it when it is already open. */
    openSettingsTab: () => void
    /** Id of the visible tab, read at dispatch time (no re-registration per switch). */
    getActiveTabId: () => string
}

export function useTabCommands({
    closeTab,
    openSettingsTab,
    getActiveTabId,
}: UseTabCommandsOptions): void {
    useRegisterCommand(CmdId.TabClose, (id: string | undefined) => {
        if (id) {
            closeTab(id).catch((e: unknown) => console.error('TabClose failed:', e));
        }
    })

    // File > Close Tab / Cmd+W: same action, but the menu has no tab to name,
    // so the command resolves the visible one itself. Keeping it a command
    // (rather than a special case in the menu dispatcher) means any other
    // entry point can close the active tab too.
    useRegisterCommand(CmdId.TabCloseActive, () => {
        const id = getActiveTabId()
        if (!id) return
        closeTab(id).catch((e: unknown) => console.error('TabCloseActive failed:', e));
    })

    // macOS App > Preferences... and the non-macOS Edit > Options both land
    // here: settings live in a singleton editor tab, not a modal, so opening
    // and re-activating are the same action.
    useRegisterCommand(CmdId.UiSettingsTab, () => {
        openSettingsTab()
    })
}
