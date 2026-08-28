/**
 * @file hooks/useFileDrop.ts
 * @description Opens files dragged in from the OS (Finder/Explorer) onto the
 * app window. Parity port of UXP dragdropopen.js onDragOver/onDrop: the whole
 * window is the drop target, and the dropped paths are handed to
 * useOpenFilePaths, the same batch opener the shell-open path uses (UXP routed
 * both through openNsFileImpl).
 *
 * This hook owns only the drag side: which drags are accepted, the hover
 * overlay state, and turning dropped File objects into paths.
 *
 * Listeners are registered on window in the CAPTURE phase: the in-app DnD
 * handlers (tab reorder, scene-tree move) stopPropagation unconditionally,
 * so a bubble-phase window listener would never see a drop landing on a tab.
 * Capture-phase interception is scoped to drags carrying 'Files'; internal
 * drags (text/plain, scene-node MIME) pass through untouched.
 */

import { useEffect, useRef, useState } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { dragItemsMayContainOpenable } from '../utils/classifyDropFile'
import { useOpenFilePaths } from './useOpenFilePaths'

/** True when the drag carries OS files (not an in-app DnD payload). */
function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
}

/**
 * True when the drag should be offered as a drop target: it carries files and
 * at least one of them might be openable.
 *
 * A drag of only unopenable types (a .docx, an image) is left un-prevented so
 * the OS shows its no-drop cursor and no drop event ever fires -- the file
 * never looks droppable in the first place. Names and contents are invisible
 * until the drop, so this can only go by MIME type and deliberately fails
 * open (see dragItemsMayContainOpenable).
 */
function isAcceptableDrag(e: DragEvent): boolean {
  return hasFiles(e) && dragItemsMayContainOpenable(e.dataTransfer?.items)
}

/**
 * Window-level OS file drag-and-drop. Returns the drag-hover state for the
 * drop overlay.
 *
 * @param cm - AsyncCueMol instance (drops are ignored until it is ready)
 * @returns isDragActive - true while a Files drag hovers over the window
 */
export function useFileDrop({ cm }: { cm: AsyncCueMol | null }): { isDragActive: boolean } {
  const { openPaths } = useOpenFilePaths({ cm })
  const [isDragActive, setDragActive] = useState(false)

  // dragenter/dragleave fire in pairs on every child-element transition, so
  // hover state is a depth counter, not a boolean.
  const depthRef = useRef(0)

  // Latest-value ref so the window listeners can be registered once.
  const handleFilesRef = useRef(async (files: File[]): Promise<void> => void files)
  handleFilesRef.current = async (files: File[]): Promise<void> => {
    const paths: string[] = []
    const unresolved: string[] = []
    for (const file of files) {
      let path = ''
      try {
        path = window.electronAPI?.getPathForFile(file) ?? ''
      } catch {
        // Non-filesystem File (should not happen for an OS drop).
      }
      if (path) paths.push(path)
      else unresolved.push(file.name)
    }
    // 'drop': a batch arriving while option dialogs are up is ignored -- the
    // user is right here and can drop again.
    await openPaths(paths, { policy: 'drop', unopenable: unresolved })
  }

  useEffect(() => {
    // enter/leave use the same predicate, and a drag's item types cannot
    // change mid-gesture, so the depth counter stays balanced.
    const onDragEnter = (e: DragEvent) => {
      if (!isAcceptableDrag(e)) return
      depthRef.current += 1
      setDragActive(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (!isAcceptableDrag(e)) return
      depthRef.current = Math.max(0, depthRef.current - 1)
      if (depthRef.current === 0) setDragActive(false)
    }
    const onDragOver = (e: DragEvent) => {
      if (!isAcceptableDrag(e)) return
      // preventDefault on every dragover is required to stay a valid drop
      // target; without it the drop reverts to Chromium's default (navigate
      // to file://).
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent) => {
      // Guarded on hasFiles, not isAcceptableDrag: a rejected drag never
      // reaches here (its dragover was not prevented), and if one somehow
      // does, the per-file extension check still reports what it cannot open.
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
