import React from 'react'
import { ConfirmReloadSceneDialog } from './ConfirmReloadSceneDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'

export interface ConfirmReloadSceneDialogArgs {
  sceneName: string
}

export const {
  Provider: ConfirmReloadSceneDialogProvider,
  useShow: useShowConfirmReloadSceneDialog,
} = createDialogHook<ConfirmReloadSceneDialogArgs, boolean>({
  name: 'ConfirmReloadSceneDialog',
  // Never reload on behalf of a caller whose prompt was displaced.
  supersededResult: false,
  render: ({ visible, args, resolve }) => (
    <ConfirmReloadSceneDialog
      visible={visible}
      sceneName={args?.sceneName ?? ''}
      onResult={(proceed) => resolve(proceed)}
    />
  ),
})
