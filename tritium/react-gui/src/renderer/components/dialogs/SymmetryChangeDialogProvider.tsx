import React from 'react'
import { SymmetryChangeDialog, type SymmetryChangeDialogResult } from './SymmetryChangeDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface SymmetryChangeDialogArgs {
    sceneId: number
    objId: number
}

export const {
    Provider: SymmetryChangeDialogProvider,
    useShow: useShowSymmetryChangeDialog,
} = createDialogHook<SymmetryChangeDialogArgs, SymmetryChangeDialogResult | null>({
    name: 'SymmetryChangeDialog',
    render: ({ visible, args, resolve }) => (
        <SymmetryChangeDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            objId={args?.objId ?? 0}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
