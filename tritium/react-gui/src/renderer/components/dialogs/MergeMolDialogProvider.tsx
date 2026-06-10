import React from 'react'
import { MergeMolDialog, type MergeMolDialogResult } from './MergeMolDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface MergeMolDialogArgs {
    sceneId: number
}

export const {
    Provider: MergeMolDialogProvider,
    useShow: useShowMergeMolDialog,
} = createDialogHook<MergeMolDialogArgs, MergeMolDialogResult | null>({
    name: 'MergeMolDialog',
    render: ({ visible, args, resolve }) => (
        <MergeMolDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
