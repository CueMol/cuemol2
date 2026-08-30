import React from 'react'
import { AboutDialog } from './AboutDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

export const { Provider: AboutDialogProvider, useShow: useShowAboutDialog } =
  createDialogHook<void, void>({
    name: 'AboutDialog',
    render: ({ visible, resolve }) => (
      <AboutDialog visible={visible} onClose={() => resolve()} />
    ),
  })
