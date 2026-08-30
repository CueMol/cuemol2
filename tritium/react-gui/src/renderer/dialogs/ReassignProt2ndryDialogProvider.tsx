import React from 'react'
import {
    ReassignProt2ndryDialog,
    type ReassignProt2ndryDialogResult,
} from './ReassignProt2ndryDialog'
import { createConfirmCancelDialog } from '@renderer/hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface ReassignProt2ndryDialogArgs {
    sceneId: number
}

export const {
    Provider: ReassignProt2ndryDialogProvider,
    useShow: useShowReassignProt2ndryDialog,
} = createConfirmCancelDialog<ReassignProt2ndryDialogArgs, ReassignProt2ndryDialogResult>({
    name: 'ReassignProt2ndryDialog',
    component: ReassignProt2ndryDialog,
})
