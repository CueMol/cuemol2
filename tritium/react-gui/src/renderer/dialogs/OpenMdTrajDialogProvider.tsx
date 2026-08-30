import React from 'react'
import { OpenMdTrajDialog, type OpenMdTrajResult } from './OpenMdTrajDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createConfirmCancelDialog } from '@renderer/hooks/useDialogFactory'

/** The dialog takes no inputs; it collects everything from the user. */
export type OpenMdTrajDialogArgs = Record<string, never>

export const {
    Provider: OpenMdTrajDialogProvider,
    useShow: useShowOpenMdTrajDialog,
} = createConfirmCancelDialog<OpenMdTrajDialogArgs, OpenMdTrajResult>({
    name: 'OpenMdTrajDialog',
    component: OpenMdTrajDialog,
})
