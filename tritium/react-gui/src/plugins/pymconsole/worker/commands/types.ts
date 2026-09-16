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
import type { CompletionSourceId } from '../completion/sources'
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

/**
 * What Tab offers for one argument position.
 *
 * PyMOL's `auto_arg` entry, which is a `[source, description, suffix]`
 * triple. The suffix is appended only when exactly one candidate matched:
 * `', '` when another argument follows, `' '` when the name ends the
 * command, and `''` for an argument the user may keep typing into.
 */
export interface ArgCompletion {
  source: CompletionSourceId
  /** Spliced into "no matching X." and "matching X:". */
  description: string
  suffix: '' | ' ' | ', '
}

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
   * What Tab offers, by argument position.
   *
   * A position that is absent, or null, falls back to filename completion --
   * which is what PyMOL does for every argument it has no entry for.
   */
  completions?: (ArgCompletion | null)[]
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
