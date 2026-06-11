import React from 'react'
import {
    InteractionAnalysisDialog,
    type InteractionAnalysisDialogResult,
} from './InteractionAnalysisDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface InteractionAnalysisDialogArgs {
    sceneId: number
}

export const {
    Provider: InteractionAnalysisDialogProvider,
    useShow: useShowInteractionAnalysisDialog,
} = createDialogHook<
    InteractionAnalysisDialogArgs,
    InteractionAnalysisDialogResult | null
>({
    name: 'InteractionAnalysisDialog',
    render: ({ visible, args, resolve }) => (
        <InteractionAnalysisDialog
            visible={visible}
            sceneId={args?.sceneId ?? 0}
            onConfirm={(result) => resolve(result)}
            onCancel={() => resolve(null)}
        />
    ),
})
