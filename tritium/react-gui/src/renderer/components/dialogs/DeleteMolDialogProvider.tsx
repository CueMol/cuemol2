import React from 'react'
import { DeleteMolDialog, type DeleteMolDialogResult } from './DeleteMolDialog'
import { createConfirmCancelDialog } from '../../hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface DeleteMolDialogArgs {
    sceneId: number
}

export const {
    Provider: DeleteMolDialogProvider,
    useShow: useShowDeleteMolDialog,
} = createConfirmCancelDialog<DeleteMolDialogArgs, DeleteMolDialogResult>({
    name: 'DeleteMolDialog',
    component: DeleteMolDialog,
})
