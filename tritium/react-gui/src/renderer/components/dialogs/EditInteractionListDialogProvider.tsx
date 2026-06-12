import React from 'react'
import {
    EditInteractionListDialog,
    type EditInteractionListDialogResult,
} from './EditInteractionListDialog'

// React import is required by the JSX runtime used at test time.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'
import type { AtomIntrDefEntry } from '../../worker/server/services/atomIntrEdit.service'

export interface EditInteractionListDialogArgs {
    rendName: string
    entries: AtomIntrDefEntry[]
}

export const {
    Provider: EditInteractionListDialogProvider,
    useShow: useShowEditInteractionListDialog,
} = createDialogHook<EditInteractionListDialogArgs, EditInteractionListDialogResult | null>({
    name: 'EditInteractionListDialog',
    render: ({ visible, args, resolve }) => (
        <EditInteractionListDialog
            visible={visible}
            rendName={args?.rendName ?? ''}
            entries={args?.entries ?? []}
            onConfirm={(r) => resolve(r)}
            onCancel={() => resolve(null)}
        />
    ),
})
