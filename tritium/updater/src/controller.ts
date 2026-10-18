/**
 * @file controller.ts
 * @description The update flow as a state machine, independent of Electron and of the OS.
 *
 * `check` -> `download` -> `install` (stage the new app while this one still
 * runs) -> the host quits and calls `Installer.launchSwap`. The OS-specific
 * part is the {@link Installer}; everything the host shows is the
 * {@link UpdateStatus} handed to `onStatus` after every change.
 */

import path from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { downloadVerified } from './download'
import { fetchLatestRelease, findUpdate, type ReleaseInfo, type UpdatePlatform } from './release'
import { formatVersion, type Version } from './version'

/** Where the update flow stands. */
export type UpdatePhase =
  | { phase: 'idle' }
  | { phase: 'checking'; manual: boolean }
  | { phase: 'upToDate'; manual: boolean }
  | { phase: 'available'; release: ReleaseInfo }
  | { phase: 'downloading'; release: ReleaseInfo; received: number; total: number }
  | { phase: 'downloaded'; release: ReleaseInfo }
  | { phase: 'installing'; release: ReleaseInfo; step: InstallStep; fraction: number }
  | { phase: 'readyToRestart'; release: ReleaseInfo }
  | { phase: 'error'; message: string; release?: ReleaseInfo }

/** What `Installer.prepare` is doing. */
export type InstallStep = 'mount' | 'copy' | 'verify'

/** Everything the UI needs, sent whole on every change. */
export interface UpdateStatus {
  /** The running app's version. */
  current: string
  /**
   * Whether this install can replace itself. When false the UI offers only
   * the release page, and `reason` says why.
   */
  canInstall: boolean
  reason?: string
  state: UpdatePhase
}

/** The OS-specific half of an update. */
export interface Installer {
  /** Whether the installed app can be replaced in place by this user. */
  canInstall(): { ok: true } | { ok: false; reason: string }
  /** Unpack `file` into a staging copy next to the running app. */
  prepare(file: string, onProgress: (step: InstallStep, fraction: number) => void): Promise<void>
  /** Remove a staging copy (cancel, or a failed prepare). */
  discard(): Promise<void>
  /** Start the detached helper that swaps the staged app in once this process exits. */
  launchSwap(from: string, to: string): void
}

/** What the controller needs from its host. */
export interface ControllerDeps {
  current: Version
  platform: UpdatePlatform
  feedUrl: string
  /** For the release check (the installer itself is fetched by download.ts). */
  fetchFn: typeof fetch
  /** A directory the controller owns (downloads go below it). */
  workDir: string
  installer: Installer
  onStatus: (status: UpdateStatus) => void
}

/** Drives one update at a time; every public method is safe to call in any phase. */
export class UpdateController {
  private state: UpdatePhase = { phase: 'idle' }
  private abort: AbortController | null = null
  private readonly deps: ControllerDeps

  constructor(deps: ControllerDeps) {
    this.deps = deps
  }

  /** The status as of now. */
  status(): UpdateStatus {
    const can = this.deps.installer.canInstall()
    return {
      current: formatVersion(this.deps.current),
      canInstall: can.ok,
      ...(can.ok ? {} : { reason: can.reason }),
      state: this.state,
    }
  }

  /**
   * Look for a newer release. A check while an update is under way is
   * ignored, so a manual check cannot throw away a download.
   *
   * @param manual - from the menu: the UI then also reports "up to date"
   */
  async check(manual: boolean): Promise<void> {
    const p = this.state.phase
    if (p !== 'idle' && p !== 'upToDate' && p !== 'available' && p !== 'error') return
    this.set({ phase: 'checking', manual })
    try {
      const raw = await fetchLatestRelease(this.deps.feedUrl, this.deps.fetchFn)
      const release = findUpdate(raw, this.deps.current, this.deps.platform)
      this.set(release ? { phase: 'available', release } : { phase: 'upToDate', manual })
    } catch (e) {
      this.set({ phase: 'error', message: messageOf(e) })
    }
  }

  /** Download the release found by `check`. */
  async download(): Promise<void> {
    if (this.state.phase !== 'available' && !(this.state.phase === 'error' && this.state.release)) return
    const release = this.state.release!
    const dir = path.join(this.deps.workDir, 'download')
    const dest = path.join(dir, release.asset.name)
    this.abort = new AbortController()
    this.set({ phase: 'downloading', release, received: 0, total: release.asset.size })
    try {
      await rm(dir, { recursive: true, force: true })
      await mkdir(dir, { recursive: true })
      let last = 0
      await downloadVerified({
        url: release.asset.url,
        dest,
        digest: release.asset.digest,
        signal: this.abort.signal,
        onProgress: (received, total) => {
          // A status per chunk would flood the IPC; one per percent is plenty.
          const t = total || release.asset.size
          if (received - last < t / 100 && received < t) return
          last = received
          this.set({ phase: 'downloading', release, received, total: t })
        },
      })
      this.set({ phase: 'downloaded', release })
    } catch (e) {
      if (this.abort?.signal.aborted) this.set({ phase: 'available', release })
      else this.set({ phase: 'error', message: messageOf(e), release })
    } finally {
      this.abort = null
    }
  }

  /** Stop a download in progress; the release stays on offer. */
  cancel(): void {
    this.abort?.abort()
  }

  /** Stage the downloaded app. On success the host should quit and call {@link swapOnQuit}. */
  async install(): Promise<void> {
    if (this.state.phase !== 'downloaded') return
    const release = this.state.release
    const file = path.join(this.deps.workDir, 'download', release.asset.name)
    this.set({ phase: 'installing', release, step: 'mount', fraction: 0 })
    try {
      await this.deps.installer.prepare(file, (step, fraction) =>
        this.set({ phase: 'installing', release, step, fraction }),
      )
      this.set({ phase: 'readyToRestart', release })
    } catch (e) {
      await this.deps.installer.discard().catch(() => {})
      this.set({ phase: 'error', message: messageOf(e), release })
    }
  }

  /** Called on the way out: start the swap if an update is staged. */
  swapOnQuit(): boolean {
    if (this.state.phase !== 'readyToRestart') return false
    this.deps.installer.launchSwap(formatVersion(this.deps.current), this.state.release.version)
    return true
  }

  private set(state: UpdatePhase): void {
    this.state = state
    this.deps.onStatus(this.status())
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
