/**
 * @file plugins/pymconsole/shared/consoleTypes.ts
 * @description What crosses between the console panel and the worker.
 *
 * One call carries whatever was submitted -- which may be several commands,
 * because `;` joins them and a pasted script is many lines -- and comes back
 * with the transcript lines to append. Wire shapes only: no React, no C++.
 */

import type { Result } from '@renderer/worker/shared/result'

/** One line of the transcript, and how it should read. */
export type ConsoleEntryKind = 'echo' | 'output' | 'warning' | 'error'

export interface ConsoleEntry {
  kind: ConsoleEntryKind
  text: string
}

export interface RunCommandArgs {
  sceneId: number
  viewId: number
  /** What the user submitted: one command, several joined by `;`, or a script. */
  text: string
}

export interface RunCommandOutcome {
  /** The lines to append, in order. */
  entries: ConsoleEntry[]
  /** Whether the scene was changed, and so whether a transaction was committed. */
  mutated: boolean
  /** Whether a failure stopped the rest of the submission from running. */
  aborted: boolean
}

export type RunCommandResult = Result<RunCommandOutcome>
