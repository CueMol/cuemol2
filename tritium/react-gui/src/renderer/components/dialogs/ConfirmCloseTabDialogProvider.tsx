import React from 'react'
import { ConfirmCloseTabDialog, type ConfirmCloseResult } from './ConfirmCloseTabDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface ConfirmCloseTabDialogArgs {
  sceneName: string
}

export const {
  Provider: ConfirmCloseTabDialogProvider,
  useShow: useShowConfirmCloseTabDialog,
} = createDialogHook<ConfirmCloseTabDialogArgs, ConfirmCloseResult>({
  name: 'ConfirmCloseTabDialog',
  render: ({ visible, args, resolve }) => (
    <ConfirmCloseTabDialog
      visible={visible}
      sceneName={args?.sceneName ?? ''}
      saveDisabled
      onResult={(result) => resolve(result)}
    />
  ),
})
