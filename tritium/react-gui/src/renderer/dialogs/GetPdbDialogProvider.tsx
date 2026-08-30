import React from 'react'
import { GetPdbDialog, type GetPdbDialogResult } from './GetPdbDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

export const { Provider: GetPdbDialogProvider, useShow: useShowGetPdbDialog } =
    createDialogHook<void, GetPdbDialogResult | null>({
        name: 'GetPdbDialog',
        render: ({ visible, resolve }) => (
            <GetPdbDialog
                visible={visible}
                onConfirm={(result) => resolve(result)}
                onCancel={() => resolve(null)}
            />
        ),
    })
