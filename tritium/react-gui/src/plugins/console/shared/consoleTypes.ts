/**
 * @file plugins/console/shared/consoleTypes.ts
 * @description What crosses between the console panel and the worker.
 *
 * One call carries whatever was submitted -- which may be several commands,
 * because `;` joins them and a pasted script is many lines -- and comes back
 * with the transcript lines to append. Wire shapes only: no React, no C++.
 */

import type { Result } from '@renderer/worker/shared/result'

/**
 * The command languages the console speaks: `native`, generated from the
 * core op catalogue, and `pymol`, the part of PyMOL's language it understands.
 */
export type DialectId = 'native' | 'pymol'

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
}

export interface CancelRunArgs {
  runId: string
}

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
}

export type RunCommandResult = Result<RunCommandOutcome>

export interface CompleteArgs {
  dialect: DialectId
  /** 0 when no scene is active; name candidates are then empty. */
  sceneId: number
  viewId: number
  /** The line the caret is on, without its newline. */
  line: string
}

export interface CompleteOutcome {
  /** The whole line, rewritten. Null leaves what was typed alone. */
  replacement: string | null
  /** The candidate list, or the line saying there was nothing. */
  messages: ConsoleEntry[]
}

export type CompleteResult = Result<CompleteOutcome>
