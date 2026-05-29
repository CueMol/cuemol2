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
  /**
   * C++ class name of the object the file resolves to (e.g. 'MolCoord',
   * 'DensityMap'). Used by the dialog as the renderer-type history key.
   * Empty string is treated as "no history" (safe no-op).
   */
  objType?: string
  /**
   * Reader nickname cuemol/core resolved for the file (e.g. 'pdb', 'mtzmap').
   * Drives which format-specific option pane is shown.
   */
  readerName?: string
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
      objType={args?.objType ?? ''}
      readerName={args?.readerName ?? ''}
      onConfirm={(options) => resolve(options)}
      onCancel={() => resolve(null)}
    />
  ),
})
