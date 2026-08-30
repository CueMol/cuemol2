/**
 * @file commands/useUiDialogCommands.ts
 * @description Registers UI dialog trigger commands (file-open dialogs, About dialog).
 */

import { useCallback } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'
import { useShowAboutDialog } from '@renderer/dialogs/AboutDialogProvider'
import { IPC } from '@shared/ipcChannels'

// Category IDs from src/qsys/InOutHandler.hpp (IOH_CAT_*)
const IOH_CAT_OBJREADER = 0
const IOH_CAT_SCEREADER = 3

interface UseUiDialogCommandsOptions {
    cm: AsyncCueMol | null
}

export function useUiDialogCommands({ cm }: UseUiDialogCommandsOptions): void {
    const showAboutDialog = useShowAboutDialog()

    const getOpenFilters = useCallback(async (catId: number): Promise<ElectronFileFilter[]> => {
        if (!cm) return []
        return cm.getOpenFilters(catId)
    }, [cm])

    useRegisterCommand(CmdId.UiOpenObjDialog, async () => {
        if (!cm) return
        const filters = await getOpenFilters(IOH_CAT_OBJREADER)
        await window.electronAPI.invoke(IPC.DIALOG_OPEN, { dialogType: 'open-obj', filters })
    })

    useRegisterCommand(CmdId.UiOpenSceneDialog, async () => {
        if (!cm) return
        const filters = await getOpenFilters(IOH_CAT_SCEREADER)
        await window.electronAPI.invoke(IPC.DIALOG_OPEN, { dialogType: 'open-scene', filters })
    })

    useRegisterCommand(CmdId.UiAboutDialog, () => showAboutDialog())
}
