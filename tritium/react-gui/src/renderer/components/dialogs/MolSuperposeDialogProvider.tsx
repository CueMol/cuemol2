import React from 'react'
import { MolSuperposeDialog, type MolSuperposeDialogResult } from './MolSuperposeDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface MolSuperposeDialogArgs {
    sceneId: number
    viewId: number
}

export const {
    Provider: MolSuperposeDialogProvider,
    useShow: useShowMolSuperposeDialog,
} = createDialogHook<MolSuperposeDialogArgs, MolSuperposeDialogResult | null>({
    name: 'MolSuperposeDialog',
    render: ({ visible, args, resolve }) => (
        <MolSuperposeDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            viewId={args?.viewId ?? 0}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
