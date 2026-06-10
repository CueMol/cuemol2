import React from 'react'
import { DeleteMolDialog, type DeleteMolDialogResult } from './DeleteMolDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface DeleteMolDialogArgs {
    sceneId: number
}

export const {
    Provider: DeleteMolDialogProvider,
    useShow: useShowDeleteMolDialog,
} = createDialogHook<DeleteMolDialogArgs, DeleteMolDialogResult | null>({
    name: 'DeleteMolDialog',
    render: ({ visible, args, resolve }) => (
        <DeleteMolDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
