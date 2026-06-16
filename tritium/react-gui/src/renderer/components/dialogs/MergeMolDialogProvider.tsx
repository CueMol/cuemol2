import React from 'react'
import { MergeMolDialog, type MergeMolDialogResult } from './MergeMolDialog'
import { createConfirmCancelDialog } from '../../hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface MergeMolDialogArgs {
    sceneId: number
}

export const {
    Provider: MergeMolDialogProvider,
    useShow: useShowMergeMolDialog,
} = createConfirmCancelDialog<MergeMolDialogArgs, MergeMolDialogResult>({
    name: 'MergeMolDialog',
    component: MergeMolDialog,
})
