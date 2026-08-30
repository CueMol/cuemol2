import React from 'react'
import { MakeMolSurfDialog, type MakeMolSurfDialogResult } from './MakeMolSurfDialog'
import { createConfirmCancelDialog } from '@renderer/hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface MakeMolSurfDialogArgs {
    sceneId: number
}

export const {
    Provider: MakeMolSurfDialogProvider,
    useShow: useShowMakeMolSurfDialog,
} = createConfirmCancelDialog<MakeMolSurfDialogArgs, MakeMolSurfDialogResult>({
    name: 'MakeMolSurfDialog',
    component: MakeMolSurfDialog,
})
