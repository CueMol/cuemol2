import React from 'react'
import { ChangeChainIdDialog, type ChangeChainIdDialogResult } from './ChangeChainIdDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface ChangeChainIdDialogArgs {
    sceneId: number
}

export const {
    Provider: ChangeChainIdDialogProvider,
    useShow: useShowChangeChainIdDialog,
} = createDialogHook<ChangeChainIdDialogArgs, ChangeChainIdDialogResult | null>({
    name: 'ChangeChainIdDialog',
    render: ({ visible, args, resolve }) => (
        <ChangeChainIdDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
