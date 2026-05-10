/**
 * @file commands/useTabCommands.ts
 * @description Registers tab management commands (close).
 * CmdId.TabNew is handled by useNewTabCommand.
 */

import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'

interface UseTabCommandsOptions {
    handleCloseTab: (id: string) => Promise<boolean>
}

export function useTabCommands({ handleCloseTab }: UseTabCommandsOptions): void {
    useRegisterCommand(CmdId.TabClose, (id: string | undefined) => {
        if (id) {
            handleCloseTab(id).catch((e: unknown) => console.error('TabClose failed:', e));
        }
    })
}
