/**
 * @file hooks/useFileDrop.ts
 * @description Opens files dragged in from the OS (Finder/Explorer) onto the
 * app window. Parity port of UXP dragdropopen.js (onDragOver/onDrop +
 * openNsFileImpl): the whole window is the drop target, each dropped file is
 * classified by extension (object readers first, then scene readers) and
 * routed through the same commands as File > Open / File > Open Scene, so a
 * drop behaves exactly like the menu path (renderer-option dialog included).
 *
 * Listeners are registered on window in the CAPTURE phase: the in-app DnD
 * handlers (tab reorder, scene-tree move) stopPropagation unconditionally,
 * so a bubble-phase window listener would never see a drop landing on a tab.
 * Capture-phase interception is scoped to drags carrying 'Files'; internal
 * drags (text/plain, scene-node MIME) pass through untouched.
 */

import { useEffect, useRef, useState } from 'react'
import { useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import { useShowErrorAlert } from '../components/dialogs/ErrorAlertDialogProvider'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import {
  classifyDropFile,
  IOH_CAT_OBJREADER,
  IOH_CAT_SCEREADER,
} from '../utils/classifyDropFile'

/** True when the drag carries OS files (not an in-app DnD payload). */
function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
}

/**
 * Window-level OS file drag-and-drop. Returns the drag-hover state for the
 * drop overlay.
 *
 * @param cm - AsyncCueMol instance (drops are ignored until it is ready)
 * @returns isDragActive - true while a Files drag hovers over the window
 */
export function useFileDrop({ cm }: { cm: AsyncCueMol | null }): { isDragActive: boolean } {
  const { dispatch } = useCommands()
  const showErrorAlert = useShowErrorAlert()
  const [isDragActive, setDragActive] = useState(false)

  // dragenter/dragleave fire in pairs on every child-element transition, so
  // hover state is a depth counter, not a boolean.
  const depthRef = useRef(0)
  // Serialize drop batches: while one batch is being opened (option dialogs
  // may be up), further drops are ignored.
  const processingRef = useRef(false)

  // Latest-value refs so the window listeners can be registered once.
  const cmRef = useRef(cm)
  cmRef.current = cm
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch
  const showErrorAlertRef = useRef(showErrorAlert)
  showErrorAlertRef.current = showErrorAlert

  const handleFilesRef = useRef(async (files: File[]): Promise<void> => void files)
  handleFilesRef.current = async (files: File[]): Promise<void> => {
    const cmNow = cmRef.current
    if (!cmNow) return
    if (processingRef.current) {
      console.warn('file drop ignored: a previous drop is still being opened')
      return
    }
    processingRef.current = true
    try {
      const [objFilters, sceneFilters] = await Promise.all([
        cmNow.getOpenFilters(IOH_CAT_OBJREADER),
        cmNow.getOpenFilters(IOH_CAT_SCEREADER),
      ])
      const unsupported: string[] = []
      // Sequential on purpose (UXP parity): each object file shows its
      // renderer-option dialog before the next file starts.
      for (const file of files) {
        let path = ''
        try {
          path = window.electronAPI.getPathForFile(file)
        } catch {
          // Non-filesystem File (should not happen for an OS drop).
        }
        if (!path) {
          unsupported.push(file.name)
          continue
        }
        const cls = classifyDropFile(file.name, objFilters, sceneFilters)
        try {
          if (cls.kind === 'obj') {
            // No readerName: sniffed by getCompatibleRendererNames, same as
            // a fresh File > Open.
            await dispatchRef.current(CmdId.OpenObjByPath, {
              name: file.name,
              path,
              contentFirst: cls.contentFirst,
            })
          } else if (cls.kind === 'scene') {
            await dispatchRef.current(CmdId.OpenSceneByPath, path)
          } else {
            unsupported.push(file.name)
          }
        } catch (e) {
          // Open failures are already surfaced by the command handlers;
          // keep going with the remaining files.
          console.error('drop open failed:', path, e)
        }
      }
      if (unsupported.length > 0) {
        await showErrorAlertRef.current({
          title: 'Cannot open dropped file',
          message:
            'No reader accepts the following file' +
            (unsupported.length > 1 ? 's' : '') +
            ':\n' +
            unsupported.join('\n'),
        })
      }
    } finally {
      processingRef.current = false
    }
  }

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depthRef.current += 1
      setDragActive(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depthRef.current = Math.max(0, depthRef.current - 1)
      if (depthRef.current === 0) setDragActive(false)
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      // preventDefault on every dragover is required to stay a valid drop
      // target; without it the drop reverts to Chromium's default (navigate
      // to file://).
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      depthRef.current = 0
      setDragActive(false)
      const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : []
      if (files.length > 0) void handleFilesRef.current(files)
    }
    const onDragEnd = () => {
      // Chromium can skip the final dragleave (drag cancelled outside the
      // window); dragend is the safety net that clears the overlay.
      depthRef.current = 0
      setDragActive(false)
    }

    window.addEventListener('dragenter', onDragEnter, true)
    window.addEventListener('dragleave', onDragLeave, true)
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('drop', onDrop, true)
    window.addEventListener('dragend', onDragEnd, true)
    return () => {
      window.removeEventListener('dragenter', onDragEnter, true)
      window.removeEventListener('dragleave', onDragLeave, true)
      window.removeEventListener('dragover', onDragOver, true)
      window.removeEventListener('drop', onDrop, true)
      window.removeEventListener('dragend', onDragEnd, true)
    }
  }, [])

  return { isDragActive }
}
