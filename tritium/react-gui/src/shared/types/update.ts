/**
 * @file shared/types/update.ts
 * @description Wire types of the app update channels (main <-> main window).
 *
 * Mirrors `UpdateStatus` of @cuemol/updater, which main sends as is
 * (main/updater/index.ts assigns one to the other, so tsc catches a drift).
 * Declared here rather than imported because the renderer's tsconfig has no
 * Node types and the updater package is Node code.
 */

/** A newer release with an installer for this OS. */
export interface UpdateRelease {
  /** `2.3.22.550` */
  version: string
  /** Release page, for a manual download. */
  htmlUrl: string
  /** Release notes (Markdown). */
  notes: string
  asset: { name: string; url: string; size: number; digest: string }
}

/** What `install` is doing. */
export type UpdateInstallStep = 'mount' | 'copy' | 'verify'

/** Where the update flow stands. */
export type UpdatePhase =
  | { phase: 'idle' }
  | { phase: 'checking'; manual: boolean }
  | { phase: 'upToDate'; manual: boolean }
  | { phase: 'available'; release: UpdateRelease }
  | { phase: 'downloading'; release: UpdateRelease; received: number; total: number }
  | { phase: 'downloaded'; release: UpdateRelease }
  | { phase: 'installing'; release: UpdateRelease; step: UpdateInstallStep; fraction: number }
  | { phase: 'readyToRestart'; release: UpdateRelease }
  | { phase: 'error'; message: string; release?: UpdateRelease }

/** How the last update went, reported once by the next start. */
export interface UpdateSwapResult {
  outcome: 'ok' | 'rolledBack' | 'failed' | 'aborted'
  from: string
  to: string
  detail: string
}

/** Everything the UI shows, pushed whole on every change. */
export interface UpdateStatus {
  /**
   * False when the updater does not run at all (development build, an OS
   * without an installer yet). The UI then shows nothing.
   */
  supported: boolean
  /** The running app's version. */
  current: string
  /** Whether this install can replace itself; otherwise only the release page is offered. */
  canInstall: boolean
  /** Why `canInstall` is false. */
  reason?: string
  state: UpdatePhase
  /** The previous update's outcome, until the renderer dismisses it. */
  lastResult?: UpdateSwapResult | null
}
