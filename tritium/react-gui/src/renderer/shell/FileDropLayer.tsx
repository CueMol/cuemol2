/**
 * @file shell/FileDropLayer.tsx
 * @description Window-level OS file drag-and-drop (UXP dragdropopen parity).
 *
 * The drag-active flag changes on every dragenter / dragleave, so it lives
 * here rather than in App: only the overlay re-renders while a file is
 * being dragged over the window.
 */

import React from 'react'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useFileDrop } from '@renderer/features/file-io/useFileDrop'
import { FileDropOverlay } from '@renderer/features/file-io/FileDropOverlay'

export const FileDropLayer: React.FC = () => {
  const { cm } = useCueMol()
  const { isDragActive } = useFileDrop({ cm })
  return isDragActive ? <FileDropOverlay /> : null
}
