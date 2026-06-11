import React from 'react'
import {
    CutSurfByPlaneDialog,
    type CutSurfByPlaneDialogResult,
} from './CutSurfByPlaneDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface CutSurfByPlaneDialogArgs {
    sceneId: number
    viewId: number
}

export const {
    Provider: CutSurfByPlaneDialogProvider,
    useShow: useShowCutSurfByPlaneDialog,
} = createDialogHook<
    CutSurfByPlaneDialogArgs,
    CutSurfByPlaneDialogResult | null
>({
    name: 'CutSurfByPlaneDialog',
    render: ({ visible, args, resolve }) => (
        <CutSurfByPlaneDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            viewId={args?.viewId ?? 0}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
