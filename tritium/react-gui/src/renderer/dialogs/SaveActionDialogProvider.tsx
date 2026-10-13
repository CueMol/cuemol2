import React from 'react'
import { SaveActionDialog } from './SaveActionDialog'
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface SaveActionDialogArgs {
    /** Why the steps cannot be a macro; null when they can. */
    macroBlock: string | null
}

export const {
    Provider: SaveActionDialogProvider,
    useShow: useShowSaveActionDialog,
} = createDialogHook<SaveActionDialogArgs, { name: string; asMacro: boolean } | null>({
    name: 'SaveActionDialog',
    render: ({ visible, args, resolve }) => (
        <SaveActionDialog visible={visible} macroBlock={args?.macroBlock ?? null} onResult={(v) => resolve(v)} />
    ),
})
