import React from 'react'
import {
    ChangeResidueIndexDialog,
    type ChangeResidueIndexDialogResult,
} from './ChangeResidueIndexDialog'
import { createConfirmCancelDialog } from '@renderer/hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface ChangeResidueIndexDialogArgs {
    sceneId: number
}

export const {
    Provider: ChangeResidueIndexDialogProvider,
    useShow: useShowChangeResidueIndexDialog,
} = createConfirmCancelDialog<ChangeResidueIndexDialogArgs, ChangeResidueIndexDialogResult>({
    name: 'ChangeResidueIndexDialog',
    component: ChangeResidueIndexDialog,
})
