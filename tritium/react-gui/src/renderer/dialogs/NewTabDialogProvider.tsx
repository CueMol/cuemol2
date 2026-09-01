import React from 'react'
import { NewTabDialog, type NewTabDialogResult } from './NewTabDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '@renderer/hooks/useDialogFactory'
import {
  FACTORY_NEW_SCENE_DEFAULTS,
  type NewSceneDefaults,
} from '@renderer/data/newSceneDefaults'

export interface NewTabDialogArgs {
  currentSceneName: string | null
  defaultSceneName: string
  defaultViewName: string
  /** Scene settings to open with; the remembered ones when omitted. */
  sceneDefaults?: NewSceneDefaults
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
        sceneDefaults={args?.sceneDefaults ?? FACTORY_NEW_SCENE_DEFAULTS}
        onConfirm={(result) => resolve(result)}
        onCancel={() => resolve(null)}
      />
    ),
  })
