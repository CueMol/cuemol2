/**
 * @file plugins/mdtools/renderer/OpenMdTrajDialogProvider.tsx
 * @description Provider + `useShow` pair for the Open MD Trajectory dialog.
 *
 * Mounted by the plugin Root rather than by core's DialogContext, so the
 * dialog disappears with the plugin.
 */

import React from 'react'
import { OpenMdTrajDialog, type OpenMdTrajResult } from './OpenMdTrajDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createConfirmCancelDialog } from '@renderer/plugin-host/api'

/** The dialog takes no inputs; it collects everything from the user. */
export type OpenMdTrajDialogArgs = Record<string, never>

export const {
    Provider: OpenMdTrajDialogProvider,
    useShow: useShowOpenMdTrajDialog,
} = createConfirmCancelDialog<OpenMdTrajDialogArgs, OpenMdTrajResult>({
    name: 'OpenMdTrajDialog',
    component: OpenMdTrajDialog,
})
