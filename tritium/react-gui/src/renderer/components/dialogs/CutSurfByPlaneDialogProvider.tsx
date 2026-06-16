import React from 'react'
import {
    CutSurfByPlaneDialog,
    type CutSurfByPlaneDialogResult,
} from './CutSurfByPlaneDialog'
import { createConfirmCancelDialog } from '../../hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface CutSurfByPlaneDialogArgs {
    sceneId: number
    viewId: number
}

export const {
    Provider: CutSurfByPlaneDialogProvider,
    useShow: useShowCutSurfByPlaneDialog,
} = createConfirmCancelDialog<
    CutSurfByPlaneDialogArgs,
    CutSurfByPlaneDialogResult
>({
    name: 'CutSurfByPlaneDialog',
    component: CutSurfByPlaneDialog,
})
