import React from 'react'
import { MakeMolSurfDialog, type MakeMolSurfDialogResult } from './MakeMolSurfDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface MakeMolSurfDialogArgs {
    sceneId: number
}

export const {
    Provider: MakeMolSurfDialogProvider,
    useShow: useShowMakeMolSurfDialog,
} = createDialogHook<MakeMolSurfDialogArgs, MakeMolSurfDialogResult | null>({
    name: 'MakeMolSurfDialog',
    render: ({ visible, args, resolve }) => (
        <MakeMolSurfDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
