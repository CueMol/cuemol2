/**
 * @file plugins/pymconsole/worker/commands/types.ts
 * @description What a console command is.
 *
 * A command declares the PyMOL name, the parameters PyMOL declares for it,
 * and a `run` that reaches the existing worker services. The declaration and
 * the body are deliberately separable: `run` takes bound arguments and calls
 * services, and knows nothing about how the line was parsed.
 *
 * That split is what would let these bodies be shared with the AI agent's
 * tools later. Anything PyMOL-shaped -- the argument grammar, the settings
 * name table, the wording of an error -- belongs in `parser/` or `helpers`,
 * not in a `run`.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { ArgMode } from '../parser/parseArgs'
import type { ParamSpec } from '../parser/bindArgs'

export type { ParamSpec } from '../parser/bindArgs'
export type { ArgMode } from '../parser/parseArgs'

/** What a command may do besides returning: write output, note a change. */
export interface CmdContext {
  sceneId: number
  viewId: number
  /** Working directory for relative paths, moved by `cd`. */
  cwd: string
  /** A line of ordinary output. */
  print(text: string): void
  /** A line saying something was not honoured. */
  warn(text: string): void
  /**
   * Note that the scene changed, for a command whose `mutates` cannot be
   * decided statically (`view` only writes when the action is `store`).
   */
  markMutated(): void
  /** Move the working directory (`cd` only). */
  setCwd(dir: string): void
}

/** A command either did its job or has a reason it could not. */
export type CmdOutcome = { ok: true } | { ok: false; error: string }

/** One console command. */
export interface PymCommand {
  /** PyMOL's name for it. */
  name: string
  /** PyMOL's parameters, in order. */
  params: ParamSpec[]
  /** How the argument list is read. */
  mode: ArgMode
  /** Whether a successful run changes the scene, for the undo transaction. */
  mutates: boolean
  /** One line for `help`. */
  summary: string
  /**
   * Do it.
   *
   * Never throws: a failure is `{ ok: false, error }` so the transcript can
   * show the reason and the run can stop cleanly.
   */
  run(
    ctx: WorkerContext,
    args: Record<string, string>,
    cc: CmdContext,
  ): CmdOutcome | Promise<CmdOutcome>
}

/** A command that is declared but not implemented yet. */
export function notImplemented(name: string, phase: string): CmdOutcome {
  return { ok: false, error: `${name}: not implemented yet (${phase})` }
}
