/**
 * @file plugins/pymconsole/renderer/consoleSessionStore.ts
 * @description The transcript and the half-typed line, kept outside React.
 *
 * A module singleton rather than a context, for two reasons that both come
 * from where the pieces are mounted. The plugin `Root` lives under
 * `PluginRoots` and the panel under `BottomPanel` -- sibling subtrees, so no
 * context can span them. And the bottom panel mounts only the active tab, so
 * switching to Output and back would otherwise throw the session away.
 *
 * `useSyncExternalStore` gives components the same value the runner writes.
 */

import { useSyncExternalStore } from 'react'
import type { ConsoleEntry } from '../shared/consoleTypes'

/** A transcript line with an id, so React can key it. */
export interface ConsoleLine extends ConsoleEntry {
  id: number
}

/** What runs a submission. Owned by the Root, called by the panel. */
export type ConsoleRunner = (text: string) => void

/** Stops the submission in progress. */
export type ConsoleStopper = () => void

export interface ConsoleSessionState {
  lines: ConsoleLine[]
  /** True while a submission is in flight; the prompt is disabled. */
  running: boolean
  /** What is typed but not sent, kept across tab switches. */
  draft: string
  runner: ConsoleRunner | null
  stopper: ConsoleStopper | null
}

const EMPTY: ConsoleSessionState = {
  lines: [],
  running: false,
  draft: '',
  runner: null,
  stopper: null,
}

let state: ConsoleSessionState = EMPTY
const listeners = new Set<() => void>()
let nextId = 1

function emit(next: ConsoleSessionState): void {
  state = next
  for (const l of listeners) l()
}

function withIds(entries: readonly ConsoleEntry[]): ConsoleLine[] {
  return entries.map((e) => ({ ...e, id: nextId++ }))
}

/** Subscribe a component to the session. */
export function useConsoleSession(): ConsoleSessionState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}

/** Read the session without subscribing. */
export function getConsoleSession(): ConsoleSessionState {
  return state
}

export const consoleSession = {
  /** The Root registers the runner it owns. */
  setRunner(runner: ConsoleRunner | null, stopper: ConsoleStopper | null = null): void {
    emit({ ...state, runner, stopper })
  },

  setDraft(draft: string): void {
    emit({ ...state, draft })
  },

  /** A submission started: echo nothing yet, the worker returns the echo. */
  begin(): void {
    emit({ ...state, running: true })
  },

  /** A submission finished, with the lines it produced. */
  finish(entries: readonly ConsoleEntry[]): void {
    emit({ ...state, running: false, lines: [...state.lines, ...withIds(entries)] })
  },

  /** A submission could not be made at all (no scene, worker gone). */
  failed(message: string): void {
    emit({
      ...state,
      running: false,
      lines: [...state.lines, ...withIds([{ kind: 'error', text: message }])],
    })
  },

  /**
   * Append lines that did not come from running a command.
   *
   * Tab prints its candidate list this way: the completion service is not the
   * runner, so `running` is not its to touch.
   */
  append(entries: readonly ConsoleEntry[]): void {
    if (entries.length === 0) return
    emit({ ...state, lines: [...state.lines, ...withIds(entries)] })
  },

  /** Say something that did not come from a command. */
  notice(message: string): void {
    emit({ ...state, lines: [...state.lines, ...withIds([{ kind: 'output', text: message }])] })
  },

  /**
   * Empty the transcript, keeping the runner.
   *
   * Distinct from `reset`: dropping the runner would leave the prompt dead
   * until the Root re-registered one.
   */
  clear(): void {
    emit({ ...state, lines: [] })
  },

  /** Drop everything, including the runner. For unmount of the Root. */
  reset(): void {
    emit(EMPTY)
  },
}
