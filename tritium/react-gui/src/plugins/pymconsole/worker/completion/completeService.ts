/**
 * @file plugins/pymconsole/worker/completion/completeService.ts
 * @description The worker service Tab calls.
 *
 * Separate from `runCommand` because completion must not open an undo
 * transaction: it reads the scene to list names and changes nothing, and a
 * transaction opened per keystroke would make the undo stack unreadable.
 *
 * Missing scene is not an error. Tab on a fresh window should still complete
 * a command name and a path, so a sceneId of 0 (or one that no longer
 * resolves) simply leaves the name-based sources empty.
 */

import { ok } from '@renderer/worker/shared/result'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CompleteArgs, CompleteResult } from '../../shared/consoleTypes'
import { currentDir } from '../runCommand'
import { completeLine } from './complete'

export function complete(ctx: WorkerContext, args: CompleteArgs): CompleteResult {
  const outcome = completeLine(ctx, args.line, {
    sceneId: args.sceneId,
    viewId: args.viewId,
    cwd: currentDir(),
  })
  return ok(outcome)
}
