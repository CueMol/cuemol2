import React from 'react'
import { ChangeChainIdDialog, type ChangeChainIdDialogResult } from './ChangeChainIdDialog'
import { createConfirmCancelDialog } from '@renderer/hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface ChangeChainIdDialogArgs {
    sceneId: number
}

export const {
    Provider: ChangeChainIdDialogProvider,
    useShow: useShowChangeChainIdDialog,
} = createConfirmCancelDialog<ChangeChainIdDialogArgs, ChangeChainIdDialogResult>({
    name: 'ChangeChainIdDialog',
    component: ChangeChainIdDialog,
})
