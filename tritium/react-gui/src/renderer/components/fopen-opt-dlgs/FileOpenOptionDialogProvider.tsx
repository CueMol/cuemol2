import React from 'react'
import { FileOpenOptionDialog } from './FileOpenOptionDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import type { FileOpenOptions } from './types'
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface FileOpenOptionDialogArgs {
  filePath: string
  sceneId: number
  rendererTypes?: string[]
}

export const {
  Provider: FileOpenOptionDialogProvider,
  useShow: useShowFileOpenOptionDialog,
} = createDialogHook<FileOpenOptionDialogArgs, FileOpenOptions | null>({
  name: 'FileOpenOptionDialog',
  render: ({ visible, args, resolve }) => (
    <FileOpenOptionDialog
      visible={visible}
      filePath={args?.filePath ?? ''}
      sceneId={args?.sceneId ?? 0}
      rendererTypes={args?.rendererTypes ?? []}
      onConfirm={(options) => resolve(options)}
      onCancel={() => resolve(null)}
    />
  ),
})
