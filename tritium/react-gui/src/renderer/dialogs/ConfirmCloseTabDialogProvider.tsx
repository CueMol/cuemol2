import React from 'react'
import { ConfirmCloseTabDialog, type ConfirmCloseResult } from './ConfirmCloseTabDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

export interface ConfirmCloseTabDialogArgs {
  sceneName: string
}

export const {
  Provider: ConfirmCloseTabDialogProvider,
  useShow: useShowConfirmCloseTabDialog,
} = createDialogHook<ConfirmCloseTabDialogArgs, ConfirmCloseResult>({
  name: 'ConfirmCloseTabDialog',
  // A displaced caller must not fall through to the 'save' branch of
  // App.confirmCloseTab: it never asked the user anything, so the tab stays.
  supersededResult: 'cancel',
  render: ({ visible, args, resolve }) => (
    <ConfirmCloseTabDialog
      visible={visible}
      sceneName={args?.sceneName ?? ''}
      onResult={(result) => resolve(result)}
    />
  ),
})
