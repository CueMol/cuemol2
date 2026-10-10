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
import type { OpGroup } from '@renderer/worker/server/catalog/op'
import type { ArgMode } from '../parser/parseArgs'
import type { ArgRule, ParamSpec } from '../parser/bindArgs'
import type { SplitCommand } from '../parser/splitCommands'
import type { DialectId, SceneRequest } from '../../shared/consoleTypes'

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
  /**
   * Hand a scene command to the panel and end the submission here; what
   * follows is sent back for the panel to submit once the scene command is
   * done. False inside a script, which cannot be split that way.
   */
  requestScene(req: SceneRequest): boolean
}

/** A command either did its job or has a reason it could not. */
export type CmdOutcome = { ok: true } | { ok: false; error: string }

/**
 * Where Tab finds the values of one parameter.
 *
 * PyMOL's `auto_arg` entry (`[source, description, suffix]`), kept as the
 * shape so PyMOL commands declare it as PyMOL does. What follows a value
 * once it is chosen is decided per candidate (`completion/complete.ts`).
 */
export interface ArgCompletion {
  /**
   * A source id the dialect's `candidates` understands; `files` lists the
   * file system (a path parameter).
   */
  source: string
  /** The heading of its candidates: "matching X:", "no matching X.". */
  description: string
  /**
   * What follows a chosen value, when the language fixes it (PyMOL: `' '`
   * after a name that ends the command). Without it: `, ` while parameters
   * remain unbound, else nothing.
   */
  suffix?: '' | ' ' | ', '
  /** A value the user keeps typing into (a selection, a path): nothing follows it. */
  open?: boolean
  /**
   * For `files`: `openable` lists the files a load opens (by the readers'
   * extensions) and directories, or every file when none of those match
   * (zsh `_files -g`); `dirs` lists directories only.
   */
  files?: 'openable' | 'dirs'
}

/**
 * One candidate, when a source says more than its text.
 *
 * After LSP's CompletionItem: what to insert, and what comes after it --
 * `next` ends the value (the separator follows), `continue` leaves the
 * caret in it (`name=`, `obj.`, a directory).
 */
export interface CompletionItem {
  text: string
  then?: 'next' | 'continue'
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
  /** The heading the native `help` lists it under. */
  group?: OpGroup
  /**
   * Where Tab finds each parameter's values: `completions[i]` is for
   * `params[i]`, whatever position or name it is typed at. A parameter with
   * no entry offers no values (a dialect with `fileFallback` lists files).
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
  /** The console's working directory, for a source that reads a file typed earlier. */
  cwd: string
  /**
   * The arguments typed before the one being completed, by parameter name,
   * whether they were typed by position or by name. A source that depends on
   * an earlier argument (the values of the property being set) reads it here.
   */
  bound: Readonly<Record<string, string>>
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
  /** How typed arguments are matched to parameters (`parser/bindArgs.ts`). */
  argRule: ArgRule
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
   * PyMOL's habit: where a parameter has no values to offer, list files.
   * Off for a dialect whose path parameters say so themselves.
   */
  fileFallback: boolean
  /** The candidates for one completion source, or null when it has none to offer. */
  candidates(id: string, ctx: WorkerContext, sc: SourceContext): (string | CompletionItem)[] | null
}
