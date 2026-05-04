/**
 * @file commands/useTabCommands.ts
 * @description Registers tab management commands (new/close).
 */

import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'

interface UseTabCommandsOptions {
    handleNewTab: () => void
    handleCloseTab: (id: string) => void
}

export function useTabCommands({ handleNewTab, handleCloseTab }: UseTabCommandsOptions): void {
    useRegisterCommand(CmdId.TabNew, () => handleNewTab())

    useRegisterCommand(CmdId.TabClose, (id: string | undefined) => {
        if (id) handleCloseTab(id)
    })
}
