/**
 * @file plugins/console/worker/runtime/types.ts
 * @description What a console command is, and what a dialect is.
 *
 * The console runs one language at a time, a dialect: the native one, whose
 * commands are generated from the core op catalogue, or one written by hand
 * in another program's terms (PyMOL). A dialect owns how its lines are read
 * (`DialectSyntax`: splitting, the command word, the arguments, Tab); the
 * runtime owns what is the same for all of them -- the transaction a
 * submission runs in, Stop, scripts, the log -- and knows no dialect's
 * grammar.
 *
 * A command declares its name, its parameters and a `run` that reaches the
 * existing worker services. The declaration and the body are deliberately
 * separable: `run` takes bound arguments and calls services, and knows
 * nothing about how the line was parsed.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { OpGroup } from '@renderer/worker/server/catalog/op'
import type { ArgMode } from '../parser/parseArgs'
import type { ParamSpec } from '../parser/bindArgs'
import type { SceneRequest } from '../../shared/consoleTypes'
import type { CompletionContext, CompletionOutcome } from '../completion/engine'
import type { DialectMeta } from '../../shared/dialectMeta'

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
  /** Output written as Markdown (help), formatted by the panel and tritium_cli. */
  printMarkdown(text: string): void
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
  /**
   * The argument is a list of words separated by spaces, as a zsh command
   * line is (`runtime/paths.ts`): files to load, nodes, property paths. Tab
   * completes the last word and expands a pattern in place to every match
   * (files here, anything else through `ConsoleDialect.expand`).
   */
  list?: boolean
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
  /** How the argument list is read, for a dialect with the comma grammar (`parser/`). */
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
   * no entry offers no values (the PyMOL dialect then lists files).
   */
  completions?: (ArgCompletion | null)[]
  /**
   * Whether this call has to run outside the submission's transaction --
   * saving a scene resets the undo stack, which cannot happen inside one.
   * Such a call must then be the only command on the line, like `undo`.
   */
  outsideTxn?: (args: Record<string, string>) => boolean
  /**
   * `undo` / `redo`: the runtime runs a lone one outside the submission's
   * transaction, since it moves the undo stack; `run` is reached only when
   * one shares a line with other commands, where it cannot run.
   */
  undoStack?: 'undo' | 'redo'
  /** Never written to the log: a command about the log itself (`open_log`, `log`). */
  unlogged?: boolean
  /**
   * The parameter naming a script file it runs (`run file`). Alone on the
   * line with a qax file, the runtime replays it one undo step per action,
   * as the file was recorded.
   */
  scriptParam?: string
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

/** One command of a submission, as the dialect split it. */
export interface DialectLine {
  /** The command, as `resolve` and `bind` read it. */
  text: string
  /** What the transcript echoes after the prompt, and the log records. */
  display: string
  /** Run it, but keep it out of the transcript and the log (PyMOL's `_ `). */
  quiet: boolean
  /** A line that only runs a script file (PyMOL's `@file`): the file. */
  scriptPath?: string
  /** Why the dialect will not run this line at all (PyMOL's `/python`). */
  error?: string
  /**
   * The line as typed, so the commands after a scene command can be
   * submitted again (`RunCommandOutcome.rest`), one per line.
   */
  source: string
}

/** What a dialect made of a command's arguments. */
export type BindResult =
  | { kind: 'args'; args: Record<string, string> }
  /** The user asked for the usage (PyMOL's `cmd ?`): print it, run nothing. */
  | { kind: 'usage'; usage: string }
  | { kind: 'error'; error: string }

/**
 * How a dialect's lines are read. Every dialect has one: the runtime and the
 * completion service call these and never read a line themselves, so one
 * dialect's grammar is never another's default.
 */
/** The scene a line is bound in (`DialectSyntax.bind`). */
export interface BindScene {
  ctx: WorkerContext
  sceneId: number
}

export interface DialectSyntax {
  /** The commands of a submission (or a script's text), in order. */
  split(text: string): DialectLine[]
  /** The command a line names, or why none. */
  resolve(text: string, commands: readonly ConsoleCommand[]): { kind: 'found'; spec: ConsoleCommand } | { kind: 'error'; error: string }
  /**
   * The line's arguments, bound to `spec`'s parameters (defaults filled in).
   *
   * @param scene - the scene the line runs in, given just before it runs,
   *   for a grammar that depends on it (ChimeraX reads the scene's named
   *   selections as selectors). Absent where no scene is at hand.
   */
  bind(spec: ConsoleCommand, text: string, scene?: BindScene): BindResult
  /**
   * Tab on `line`: the line rewritten, written back in this grammar (its
   * separators, how an argument is named, what needs quoting).
   */
  complete(ctx: WorkerContext, line: string, cc: CompletionContext): CompletionOutcome
}

/** One command language the console can speak. */
export interface ConsoleDialect {
  /**
   * What it says about itself: its id, prompt (what the transcript echoes a
   * command after), undo label prefix, action-log source and script files.
   */
  meta: DialectMeta
  /** How its lines are read. */
  syntax: DialectSyntax
  /** Every command. */
  commands(): readonly ConsoleCommand[]
  /**
   * Why a script file cannot run in this dialect (a Python file), or null.
   * A file that is another dialect's script is refused by the runtime.
   */
  refuseScript(filePath: string): string | null
  /** The candidates for one completion source, or null when it has none to offer. */
  candidates(id: string, ctx: WorkerContext, sc: SourceContext): (string | CompletionItem)[] | null
  /**
   * For a list argument (`ArgCompletion.list`) of a source other than files:
   * the words a pattern (`sc.pattern`, as `PathWord.pattern` writes it)
   * expands to, each written as it is typed in a list; null when the word is
   * no pattern, or the source has none.
   */
  expand?(id: string, ctx: WorkerContext, sc: SourceContext): string[] | null
}
