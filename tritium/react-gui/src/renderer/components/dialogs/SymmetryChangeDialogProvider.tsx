import React from 'react'
import { SymmetryChangeDialog, type SymmetryChangeDialogResult } from './SymmetryChangeDialog'
import { createConfirmCancelDialog } from '../../hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface SymmetryChangeDialogArgs {
    sceneId: number
    objId: number
}

export const {
    Provider: SymmetryChangeDialogProvider,
    useShow: useShowSymmetryChangeDialog,
} = createConfirmCancelDialog<SymmetryChangeDialogArgs, SymmetryChangeDialogResult>({
    name: 'SymmetryChangeDialog',
    component: SymmetryChangeDialog,
})
