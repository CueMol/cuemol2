import React from 'react'
import { RegenMolSurfDialog, type RegenMolSurfDialogResult } from './RegenMolSurfDialog'
import { createConfirmCancelDialog } from '@renderer/hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface RegenMolSurfDialogArgs {
    sceneId: number
    objId: number
    objName: string
    origMol: string
    selStr: string
    density: number
    probeRadius: number
}

export const {
    Provider: RegenMolSurfDialogProvider,
    useShow: useShowRegenMolSurfDialog,
} = createConfirmCancelDialog<RegenMolSurfDialogArgs, RegenMolSurfDialogResult>({
    name: 'RegenMolSurfDialog',
    component: RegenMolSurfDialog,
})
