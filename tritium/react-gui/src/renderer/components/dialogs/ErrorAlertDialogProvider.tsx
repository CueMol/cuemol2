import React from 'react'
import { ErrorAlertDialog, type ErrorAlertDialogArgs } from './ErrorAlertDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export const { Provider: ErrorAlertDialogProvider, useShow: useShowErrorAlert } =
    createDialogHook<ErrorAlertDialogArgs, void>({
        name: 'ErrorAlertDialog',
        render: ({ visible, args, resolve }) => (
            <ErrorAlertDialog
                visible={visible}
                title={args?.title ?? 'Error'}
                message={args?.message ?? ''}
                onClose={() => resolve()}
            />
        ),
    })
