/**
 * @file features/file-io/useOpenFilePaths.ts
 * @description Opens a batch of file paths through the same commands as
 * File > Open / File > Open Scene, one file at a time.
 *
 * Shared by every source of "here are files to open": an OS drag-and-drop
 * (useFileDrop) and an OS shell / command-line open (useShellOpenFiles). This
 * mirrors UXP, where onDrop and openFromShell both funnel into openNsFileImpl.
 *
 * Each path is classified by extension against the C++ reader lists (object
 * readers before scene readers) and dispatched; files no reader accepts are
 * collected and reported in a single alert at the end of the batch.
 */

import { useCallback } from 'react'
import { useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { useShowErrorAlert } from '@renderer/dialogs/ErrorAlertDialogProvider'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import {
  classifyDropFile,
  IOH_CAT_OBJREADER,
  IOH_CAT_SCEREADER,
} from '@renderer/utils/classifyDropFile'

/**
 * What to do when another batch is already being opened.
 *   - 'drop'  : ignore the new request (an OS drop; the user can drop again)
 *   - 'queue' : wait for the running batch (a shell open; the request came
 *               from outside the app and must not be lost)
 */
export type OpenBusyPolicy = 'drop' | 'queue'

export interface OpenPathsOptions {
  /** Busy behaviour. Defaults to 'drop'. */
  policy?: OpenBusyPolicy
  /**
   * Display names the caller already knows are unopenable, merged into the
   * batch's single closing alert (e.g. a dropped File with no filesystem path).
   */
  unopenable?: string[]
}

export interface OpenFilePathsApi {
  /** Open each path sequentially. Resolves when the whole batch is done. */
  openPaths: (paths: string[], opts?: OpenPathsOptions) => Promise<void>
}

// Module-level, not per-hook: the two consumers must be mutually exclusive.
// The renderer-option dialog provider keeps a single `resolve` slot, so
// showing it twice concurrently leaves the first caller's promise unsettled
// forever. `tail` chains queued batches behind the running one.
let opening = false
let tail: Promise<void> = Promise.resolve()

/** Test-only: reset the module-level batch state between cases. */
export function resetOpenFilePathsForTests(): void {
  opening = false
  tail = Promise.resolve()
}

/** Last path segment, for the object-open label. UXP used nsIFile.leafName. */
function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

/**
 * Batch file opening shared by the drag-and-drop and shell-open paths.
 *
 * @param cm - AsyncCueMol instance; a batch is ignored while it is null
 *   (CueMol is still initialising and the open commands would no-op).
 */
export function useOpenFilePaths({ cm }: { cm: AsyncCueMol | null }): OpenFilePathsApi {
  const { dispatch } = useCommands()
  const showErrorAlert = useShowErrorAlert()

  const runBatch = useCallback(
    async (paths: string[], unopenable: string[]): Promise<void> => {
      opening = true
      try {
        const unsupported = [...unopenable]
        if (cm) {
          const [objFilters, sceneFilters] = await Promise.all([
            cm.getOpenFilters(IOH_CAT_OBJREADER),
            cm.getOpenFilters(IOH_CAT_SCEREADER),
          ])
          // Sequential on purpose (UXP parity): each object file's renderer
          // option dialog is answered before the next file starts.
          for (const p of paths) {
            const cls = classifyDropFile(p, objFilters, sceneFilters)
            try {
              if (cls.kind === 'obj') {
                // No readerName: sniffed downstream, same as a fresh File > Open.
                await dispatch(CmdId.OpenObjByPath, {
                  name: baseName(p),
                  path: p,
                  contentFirst: cls.contentFirst,
                })
              } else if (cls.kind === 'scene') {
                await dispatch(CmdId.OpenSceneByPath, p)
              } else {
                unsupported.push(baseName(p))
              }
            } catch (e) {
              // The command handlers surface their own failures; keep going
              // with the rest of the batch.
              console.error('open failed:', p, e)
            }
          }
        }
        if (unsupported.length > 0) {
          await showErrorAlert({
            title: 'Cannot open file',
            message:
              'No reader accepts the following file' +
              (unsupported.length > 1 ? 's' : '') +
              ':\n' +
              unsupported.join('\n'),
          })
        }
      } finally {
        opening = false
      }
    },
    [cm, dispatch, showErrorAlert],
  )

  const openPaths = useCallback(
    (paths: string[], opts: OpenPathsOptions = {}): Promise<void> => {
      const unopenable = opts.unopenable ?? []
      if (paths.length === 0 && unopenable.length === 0) return Promise.resolve()

      if (!opening) {
        // Start synchronously rather than through tail.then(): routing the
        // first batch through a microtask would delay the first dispatch by a
        // tick and change the observable ordering callers rely on.
        const p = runBatch(paths, unopenable)
        tail = p.catch(() => undefined)
        return p
      }
      if ((opts.policy ?? 'drop') === 'drop') {
        console.warn('file open ignored: a previous batch is still being opened')
        return Promise.resolve()
      }
      const p = tail.then(() => runBatch(paths, unopenable))
      tail = p.catch(() => undefined)
      return p
    },
    [runBatch],
  )

  return { openPaths }
}
