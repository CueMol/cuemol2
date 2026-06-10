import React from 'react'
import {
    ChangeResidueIndexDialog,
    type ChangeResidueIndexDialogResult,
} from './ChangeResidueIndexDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface ChangeResidueIndexDialogArgs {
    sceneId: number
}

export const {
    Provider: ChangeResidueIndexDialogProvider,
    useShow: useShowChangeResidueIndexDialog,
} = createDialogHook<ChangeResidueIndexDialogArgs, ChangeResidueIndexDialogResult | null>({
    name: 'ChangeResidueIndexDialog',
    render: ({ visible, args, resolve }) => (
        <ChangeResidueIndexDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
