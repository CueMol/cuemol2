/**
 * @file plugins/console/shared/consoleTypes.ts
 * @description What crosses between the console panel and the worker.
 *
 * One call carries whatever was submitted -- which may be several commands,
 * because `;` joins them and a pasted script is many lines -- and comes back
 * with the transcript lines to append. Wire shapes only: no React, no C++.
 */

import type { Result } from '@renderer/worker/shared/result'
import type { CompletionCandidate } from '@cuemol/console-kit'

/**
 * The command languages the console speaks: `native`, generated from the
 * core op catalogue, and `pymol`, the part of PyMOL's language it understands.
 */
export type DialectId = 'native' | 'pymol'

/** The plugin id, which is also its preferences key. */
export const CONSOLE_PLUGIN_ID = 'console'

/** The plugin preference holding the dialect the panel speaks. */
export const DIALECT_PREF = 'dialect'

/** The plugin preference that opens the endpoint `tritium_cli` talks to. */
export const REMOTE_ACCESS_PREF = 'remoteAccess'

/** The Settings row (custom, nothing stored) that shows where tritium_cli is. */
export const CLI_PATH_ROW = 'cliPath'

/** The dialect a fresh panel speaks. */
export const DEFAULT_DIALECT: DialectId = 'native'

/** What each dialect's prompt reads, in the panel and in the transcript's echo. */
export const DIALECT_PROMPTS: Readonly<Record<DialectId, string>> = {
  native: 'CueMol>',
  pymol: 'PyM>',
}

/** One line of the transcript, and how it should read. */
export type ConsoleEntryKind = 'echo' | 'output' | 'warning' | 'error'

export interface ConsoleEntry {
  kind: ConsoleEntryKind
  text: string
}

export interface RunCommandArgs {
  /** The language `text` is written in. */
  dialect: DialectId
  sceneId: number
  viewId: number
  /** What the user submitted: one command, several joined by `;`, or a script. */
  text: string
  /** Names this run, so `cancelRun` can stop it. */
  runId: string
  /**
   * The working directory, for a caller that keeps its own (the command-line
   * client). Absent, the panel's directory is used and `cd` moves it.
   */
  cwd?: string
}

export interface CancelRunArgs {
  runId: string
}

/**
 * A scene command (`list_scenes`, `create_scene`, `switch_scene`, `close_scene`),
 * or `quit` / `exit`.
 *
 * Scenes are tabs, and the worker cannot see or make a tab, so the worker
 * only parses one and hands it back; the panel does it and then sends the
 * rest of the submission (`RunCommandOutcome.rest`), which so runs against
 * whatever scene is active by then. Quitting the app is handed back the same
 * way, since only main can do it; nothing after it runs.
 */
export type SceneRequest =
  | { op: 'list' }
  | { op: 'new'; name: string }
  /** `scene`: a list number, `#uid` or a name. */
  | { op: 'switch'; scene: string }
  /** `scene` as for switch; empty is the active scene. */
  | { op: 'close'; scene: string; discardChanges: boolean }
  /** Quit the app as Cmd+Q does; `force` skips the save prompts. */
  | { op: 'quit'; force: boolean }

export interface RunCommandOutcome {
  /** The lines to append, in order. */
  entries: ConsoleEntry[]
  /** Whether the scene was changed, and so whether a transaction was committed. */
  mutated: boolean
  /** Whether a failure, or Stop, kept the rest of the submission from running. */
  aborted: boolean
  /** Whether it was Stop. What had already run is kept, like any other abort. */
  interrupted: boolean
  /**
   * A scene file the panel should open (`load x.qsc`): into the current
   * scene when it is new and empty, otherwise in a new tab.
   */
  openScene?: string
  /** A scene command the run stopped at, for the panel to do. */
  sceneRequest?: SceneRequest
  /**
   * What followed the scene command, to submit once it is done (empty when
   * nothing did). The scene command itself has been echoed and logged.
   */
  rest?: string
  /** Where `cd` left the directory, when the caller passed `cwd`. */
  cwd?: string
}

export type RunCommandResult = Result<RunCommandOutcome>

export interface CompleteArgs {
  dialect: DialectId
  /** 0 when no scene is active; name candidates are then empty. */
  sceneId: number
  viewId: number
  /** The line the caret is on, without its newline. */
  line: string
  /** As in `RunCommandArgs`. */
  cwd?: string
}

export interface CompleteOutcome {
  /** The whole line, rewritten. Null leaves what was typed alone. */
  replacement: string | null
  /** The line saying there was nothing; candidates are not printed. */
  messages: ConsoleEntry[]
  /** Two or more candidates, for the panel to list and walk. */
  candidates?: CompletionCandidate[]
}

export type CompleteResult = Result<CompleteOutcome>
