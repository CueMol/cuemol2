import React from 'react'
import {
    ReassignProt2ndryDialog,
    type ReassignProt2ndryDialogResult,
} from './ReassignProt2ndryDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface ReassignProt2ndryDialogArgs {
    sceneId: number
}

export const {
    Provider: ReassignProt2ndryDialogProvider,
    useShow: useShowReassignProt2ndryDialog,
} = createDialogHook<ReassignProt2ndryDialogArgs, ReassignProt2ndryDialogResult | null>({
    name: 'ReassignProt2ndryDialog',
    render: ({ visible, args, resolve }) => (
        <ReassignProt2ndryDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
