import React from 'react'
import { StyleEditorDialog } from './StyleEditorDialog'

// React import is required by the JSX runtime used at test time.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

export interface StyleEditorDialogArgs {
    styleSetId: number
    scopeId: number
    sceneId: number
    styleName: string
}

export const {
    Provider: StyleEditorDialogProvider,
    useShow: useShowStyleEditorDialog,
} = createDialogHook<StyleEditorDialogArgs, void>({
    name: 'StyleEditorDialog',
    render: ({ visible, args, resolve }) => (
        <StyleEditorDialog
            visible={visible}
            styleSetId={args?.styleSetId ?? -1}
            scopeId={args?.scopeId ?? 0}
            sceneId={args?.sceneId ?? 0}
            styleName={args?.styleName ?? ''}
            onClose={() => resolve()}
        />
    ),
})
