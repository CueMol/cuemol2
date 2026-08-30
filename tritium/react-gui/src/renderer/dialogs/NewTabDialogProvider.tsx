import React from 'react'
import { NewTabDialog, type NewTabDialogResult } from './NewTabDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

export interface NewTabDialogArgs {
  currentSceneName: string | null
  defaultSceneName: string
  defaultViewName: string
}

export const { Provider: NewTabDialogProvider, useShow: useShowNewTabDialog } =
  createDialogHook<NewTabDialogArgs, NewTabDialogResult | null>({
    name: 'NewTabDialog',
    render: ({ visible, args, resolve }) => (
      <NewTabDialog
        visible={visible}
        currentSceneName={args?.currentSceneName ?? null}
        defaultSceneName={args?.defaultSceneName ?? 'Scene_1'}
        defaultViewName={args?.defaultViewName ?? 'View_1'}
        onConfirm={(result) => resolve(result)}
        onCancel={() => resolve(null)}
      />
    ),
  })
