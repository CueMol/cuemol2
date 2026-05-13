import React from 'react'
import { TextPromptDialog } from './TextPromptDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface TextPromptDialogArgs {
    title: string
    label: string
    defaultValue?: string
    confirmLabel?: string
}

export const {
    Provider: TextPromptDialogProvider,
    useShow: useShowTextPromptDialog,
} = createDialogHook<TextPromptDialogArgs, string | null>({
    name: 'TextPromptDialog',
    render: ({ visible, args, resolve }) => (
        <TextPromptDialog
            visible={visible}
            title={args?.title ?? ''}
            label={args?.label ?? ''}
            defaultValue={args?.defaultValue ?? ''}
            confirmLabel={args?.confirmLabel}
            onResult={(value) => resolve(value)}
        />
    ),
})
