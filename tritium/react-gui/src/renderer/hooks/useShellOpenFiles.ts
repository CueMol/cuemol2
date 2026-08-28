/**
 * @file hooks/useShellOpenFiles.ts
 * @description Opens files the OS handed to the app: command-line arguments, a
 * macOS 'open-file' Apple Event (Finder double-click, Open With, Dock drop,
 * Dock recent document) or a second launch. Parity port of UXP
 * dragdropopen.js openFromShell.
 *
 * Main queues the paths and this hook pulls them (IPC.SHELL_FILES_TAKE),
 * because a launch-time request exists long before this code can run: the
 * preload push bridge does not buffer, and the open commands no-op while
 * CueMol is initialising. Main only pings SHELL_FILES_PENDING to say "pull
 * again", so the queue in main stays the single source of truth and a renderer
 * reload re-pulls whatever is still waiting.
 */

import { useEffect, useRef } from 'react'
import { IPC } from '@shared/ipcChannels'
import { useShowErrorAlert } from '../components/dialogs/ErrorAlertDialogProvider'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useOpenFilePaths } from './useOpenFilePaths'

interface UseShellOpenFilesOptions {
  cm: AsyncCueMol | null
  cueMolReady: boolean
  /**
   * From useAppInitialization. Waiting on it keeps a shell-opened .qsc loading
   * in place into the launch tab rather than racing its creation and opening a
   * second tab.
   */
  initialSceneSettled: boolean
}

/** Drains main's shell-open queue once the app can act on it, and on each ping. */
export function useShellOpenFiles({
  cm,
  cueMolReady,
  initialSceneSettled,
}: UseShellOpenFilesOptions): void {
  const { openPaths } = useOpenFilePaths({ cm })
  const showErrorAlert = useShowErrorAlert()

  // Latest-value ref: the push subscription is registered once.
  const drainRef = useRef(async (): Promise<void> => {})
  drainRef.current = async (): Promise<void> => {
    const req = await window.electronAPI?.invoke(IPC.SHELL_FILES_TAKE)
    if (!req) return
    // UXP convCmdLineFiles alerted on a missing file; report before opening
    // anything so the two do not interleave.
    if (req.missing.length > 0) {
      await showErrorAlert({
        title: 'Cannot open file',
        message:
          'File not found:\n' + req.missing.join('\n'),
      })
    }
    // 'queue': the request came from outside the app, so if a renderer-option
    // dialog is already up it must wait rather than be discarded.
    if (req.paths.length > 0) await openPaths(req.paths, { policy: 'queue' })
  }

  // The gate must stay closed until the open commands can actually act:
  // before CueMol is ready they silently no-op, and before the launch scene
  // settles a .qsc would land in a second tab.
  const gateOpenRef = useRef(false)

  useEffect(() => {
    if (!cueMolReady || !initialSceneSettled) return
    if (gateOpenRef.current) return
    gateOpenRef.current = true
    void drainRef.current().catch((e: unknown) => console.error('shell open drain:', e))
  }, [cueMolReady, initialSceneSettled])

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    return api.onPush(IPC.SHELL_FILES_PENDING, () => {
      // Anything queued before the gate opens is picked up by the effect above.
      if (!gateOpenRef.current) return
      void drainRef.current().catch((e: unknown) => console.error('shell open drain:', e))
    })
  }, [])
}
