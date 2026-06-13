import React from 'react'
import {
    EditCameraVisFlagsDialog,
    type EditCameraVisFlagsDialogResult,
} from './EditCameraVisFlagsDialog'

// React import is required by the JSX runtime used at test time.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'
import type { VisFlagEntry } from '../../worker/server/services/cameraVisFlags.service'

export interface EditCameraVisFlagsDialogArgs {
    cameraName: string
    entries: VisFlagEntry[]
}

export const {
    Provider: EditCameraVisFlagsDialogProvider,
    useShow: useShowEditCameraVisFlagsDialog,
} = createDialogHook<EditCameraVisFlagsDialogArgs, EditCameraVisFlagsDialogResult | null>({
    name: 'EditCameraVisFlagsDialog',
    render: ({ visible, args, resolve }) => (
        <EditCameraVisFlagsDialog
            visible={visible}
            cameraName={args?.cameraName ?? ''}
            entries={args?.entries ?? []}
            onConfirm={(r) => resolve(r)}
            onCancel={() => resolve(null)}
        />
    ),
})
