/**
 * @file shared/types/crash.ts
 * @description Crash report forwarded from renderer to main.
 *
 * Part of the main <-> renderer IPC contract (see shared/ipcContract.ts).
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

/**
 * Where a crash originated. Names a concrete crash source so the main
 * process can route different severities differently if needed and so the
 * fallback UI can label what blew up.
 */
export type CrashSource =
  | 'worker-global'
  | 'worker-message'
  | 'worker-render-loop'
  | 'window-error'
  | 'window-unhandledrejection'
  | 'react-error-boundary'

/**
 * Crash payload forwarded from renderer to main via `IPC.CRASH_REPORT`.
 * `stack` is optional because native (C++) crashes may surface without a
 * usable JS stack -- the UI must tolerate its absence.
 */
export interface CrashReport {
  source: CrashSource
  message: string
  stack?: string
  filename?: string
  lineno?: number
  colno?: number
  /** React's componentStack -- only set when source === 'react-error-boundary'. */
  componentStack?: string
  /** Millisecond epoch at the renderer; preserved across IPC. */
  timestamp: number
}
