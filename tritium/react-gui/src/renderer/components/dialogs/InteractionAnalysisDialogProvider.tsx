import React from 'react'
import {
    InteractionAnalysisDialog,
    type InteractionAnalysisDialogResult,
} from './InteractionAnalysisDialog'
import { createConfirmCancelDialog } from '../../hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface InteractionAnalysisDialogArgs {
    sceneId: number
}

export const {
    Provider: InteractionAnalysisDialogProvider,
    useShow: useShowInteractionAnalysisDialog,
} = createConfirmCancelDialog<
    InteractionAnalysisDialogArgs,
    InteractionAnalysisDialogResult
>({
    name: 'InteractionAnalysisDialog',
    component: InteractionAnalysisDialog,
})
