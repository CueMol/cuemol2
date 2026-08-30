import React from 'react'
import { MorphAnimDialog } from './MorphAnimDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

export interface MorphAnimDialogArgs {
    sceneId: number
}

export const {
    Provider: MorphAnimDialogProvider,
    useShow: useShowMorphAnimDialog,
} = createDialogHook<MorphAnimDialogArgs, void>({
    name: 'MorphAnimDialog',
    render: ({ visible, args, resolve }) => (
        <MorphAnimDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            onClose={() => resolve()}
        />
    ),
})
