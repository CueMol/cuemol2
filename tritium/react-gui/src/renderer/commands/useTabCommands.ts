/**
 * @file commands/useTabCommands.ts
 * @description Registers tab management commands (close).
 * CmdId.TabNew is handled by useNewTabCommand.
 */

import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'

interface UseTabCommandsOptions {
    handleCloseTab: (id: string) => void | Promise<void>
}

export function useTabCommands({ handleCloseTab }: UseTabCommandsOptions): void {
    useRegisterCommand(CmdId.TabClose, (id: string | undefined) => {
        if (id) {
            const result = handleCloseTab(id);
            if (result instanceof Promise) {
                result.catch((e: unknown) => console.error('TabClose failed:', e));
            }
        }
    })
}
