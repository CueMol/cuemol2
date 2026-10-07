/**
 * @file plugins/console/worker/runtime/types.ts
 * @description What a console command is, and what a dialect is.
 *
 * The console runs one language at a time, a dialect: the native one, whose
 * commands are generated from the core op catalogue, or the PyMOL one, whose
 * commands are written by hand in PyMOL's terms. Everything else -- the
 * transaction a submission runs in, Stop, scripts, the log, Tab -- is the
 * runtime's and is the same for both.
 *
 * A command declares its name, its parameters and a `run` that reaches the
 * existing worker services. The declaration and the body are deliberately
 * separable: `run` takes bound arguments and calls services, and knows
 * nothing about how the line was parsed.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { ArgMode } from '../parser/parseArgs'
import type { ParamSpec } from '../parser/bindArgs'
import type { SplitCommand } from '../parser/splitCommands'
import type { DialectId } from '../../shared/consoleTypes'

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
  /**
   * Register a download's stream request id, so Stop cancels it (`fetch`).
   * The id should come from `streamId`.
   */
  noteStream(reqId: string): void
  /** A stream request id unique to this run, for `noteStream`. */
  streamId(tag: string): string
  /** Whether Stop has been pressed, for a command that waits on a job it can cancel. */
  stopped(): boolean
  /**
   * Run a `.pml` file's commands here, inside this submission's transaction
   * (`run`; the `@` line prefix goes through the same path).
   */
  runScript(filePath: string): Promise<CmdOutcome>
  /**
   * Ask the panel to open a scene file once the submission is done (`load
   * x.qsc`). The worker cannot make a tab, so the panel does it the way
   * File > Open does.
   */
  openScene(filePath: string): void
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
  /** A source id the dialect's `candidates` understands. */
  source: string
  /** Spliced into "no matching X." and "matching X:". */
  description: string
  suffix: '' | ' ' | ', '
}

/** One console command. */
export interface ConsoleCommand {
  /** The name it is typed as. */
  name: string
  /** Its parameters, in order. */
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
   * Whether this call has to run outside the submission's transaction --
   * saving a scene resets the undo stack, which cannot happen inside one.
   * Such a call must then be the only command on the line, like `undo`.
   */
  outsideTxn?: (args: Record<string, string>) => boolean
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

export type { DialectId } from '../../shared/consoleTypes'

/** What a completion source is asked: the scene, and the arguments so far. */
export interface SourceContext {
  sceneId: number
  viewId: number
  /**
   * The argument values typed before the one being completed, in order.
   * A source that depends on an earlier argument (the values of the property
   * being set) reads it here.
   */
  argsSoFar: readonly string[]
  /**
   * What is typed of the argument being completed. A source whose candidates
   * form a hierarchy (a property path) lists the level the pattern is at.
   */
  pattern: string
}

/** One command language the console can speak. */
export interface ConsoleDialect {
  id: DialectId
  /** What the transcript echoes a command after, without the space. */
  prompt: string
  /** The undo entry's label prefix, so the history says where an edit came from. */
  txnPrefix: string
  /** Every command, sorted by name. */
  commands(): readonly ConsoleCommand[]
  /**
   * Why a split line cannot run in this dialect at all (PyMOL's `/python`),
   * or null when it can.
   */
  refuseLine(cmd: SplitCommand): string | null
  /** Why a script file cannot run in this dialect, or null when it can. */
  refuseScript(filePath: string): string | null
  /**
   * The candidates for one completion source, or null to fall back to
   * filename completion.
   */
  candidates(id: string, ctx: WorkerContext, sc: SourceContext): string[] | null
}
