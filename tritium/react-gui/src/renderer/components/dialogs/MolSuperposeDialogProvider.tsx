import React from 'react'
import { MolSuperposeDialog, type MolSuperposeDialogResult } from './MolSuperposeDialog'
import { createConfirmCancelDialog } from '../../hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface MolSuperposeDialogArgs {
    sceneId: number
    viewId: number
}

export const {
    Provider: MolSuperposeDialogProvider,
    useShow: useShowMolSuperposeDialog,
} = createConfirmCancelDialog<MolSuperposeDialogArgs, MolSuperposeDialogResult>({
    name: 'MolSuperposeDialog',
    component: MolSuperposeDialog,
})
