/**
 * @file main/shellOpenQueue.ts
 * @description Holds the files the OS asked the app to open until the renderer
 * is ready to open them.
 *
 * The queue lives in main, not the renderer, because a launch-time request
 * arrives long before React mounts: the preload `onPush` bridge does not
 * buffer, and the open commands silently no-op while CueMol is still
 * initialising. The renderer therefore pulls this queue once it is ready, and
 * main only pings it to pull again. Keeping the payload here also means a
 * renderer reload cannot lose a queued file.
 *
 * Plain module state with no electron import, so it unit-tests directly.
 */

import type { ParsedFileArgs } from './helpers/parseFileArgs'
import type { ShellOpenRequest } from '@shared/types/fileEvents'

let pendingPaths: string[] = []
let pendingMissing: string[] = []

/**
 * Queue a batch of shell-open paths.
 *
 * Paths already queued are skipped: on macOS a launch can report the same file
 * both in argv and through an 'open-file' event. De-duplication is only
 * against what is still queued, so re-opening a file the user already opened
 * still works.
 */
export function enqueueShellOpen(req: ParsedFileArgs): void {
  for (const p of req.paths) {
    if (!pendingPaths.includes(p)) pendingPaths.push(p)
  }
  for (const p of req.missing) {
    if (!pendingMissing.includes(p)) pendingMissing.push(p)
  }
}

/**
 * Read and clear the queue. Read-and-clear is atomic on main's single thread,
 * so a request arriving while the renderer's invoke is in flight is kept for
 * the next batch rather than lost.
 */
export function takeShellOpen(): ShellOpenRequest {
  const req: ShellOpenRequest = { paths: pendingPaths, missing: pendingMissing }
  pendingPaths = []
  pendingMissing = []
  return req
}

/** True when anything is waiting to be opened. */
export function hasPendingShellOpen(): boolean {
  return pendingPaths.length > 0 || pendingMissing.length > 0
}

/** Test-only: clear the module state between cases. */
export function resetShellOpenQueueForTests(): void {
  pendingPaths = []
  pendingMissing = []
}
