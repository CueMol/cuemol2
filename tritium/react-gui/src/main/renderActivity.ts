/**
 * @file main/renderActivity.ts
 * @description Holds a power-save blocker while the main window reports a
 * running render job, and logs the renderer's OS pid at each job start.
 *
 * Fed from the RENDER_WINDOW_STATE relay: the main window pushes a 'context'
 * update on every job change, so the job's lifecycle -- including a start that
 * failed in the worker and a cancel from either window -- arrives here without
 * a second channel. The hold is edge-triggered on "active", so a movie's
 * per-frame ticks do not re-arm it.
 *
 * This is not the fix for a throttled render (that is the
 * disable-renderer-backgrounding switch in main/index.ts). The blocker only
 * keeps the machine from idle-sleeping through a long render -- on macOS an
 * IOPM NoIdleSleep assertion, which leaves App Nap and the task policy alone
 * -- and the pid log is what `ps -M -p <pid>` needs the next time a render
 * looks throttled. See docs/architecture/umbreon-render-qos-throttling.md.
 */

import { powerSaveBlocker, type BrowserWindow } from 'electron'
import type { RenderWindowStateUpdate } from '@shared/types/renderWindow'
import { isActiveRenderJobStatus } from '@shared/renderJobStatus'

/** What happens on the active -> idle edges. */
export interface RenderActivityHooks {
  onStart(): void
  onStop(): void
}

export interface RenderActivityGuard {
  /** Feed every RENDER_WINDOW_STATE update; kinds other than 'context' are ignored. */
  observe(update: RenderWindowStateUpdate): void
  /** Force idle: the renderer navigated away or the window closed. Idempotent. */
  reset(): void
}

/**
 * The edge detector: calls onStart once when a job becomes active and onStop
 * once when it stops being active (terminal status, `job: null`, or reset()).
 * Repeated updates in the same state are no-ops.
 */
export function createRenderActivityGuard(hooks: RenderActivityHooks): RenderActivityGuard {
  let active = false

  const setActive = (next: boolean): void => {
    if (next === active) return
    active = next
    if (next) hooks.onStart()
    else hooks.onStop()
  }

  return {
    observe(update) {
      if (update.kind !== 'context') return
      setActive(update.job !== null && isActiveRenderJobStatus(update.job.status))
    },
    reset() {
      setActive(false)
    },
  }
}

/**
 * The production guard for the main window: a 'prevent-app-suspension'
 * power-save blocker for the duration of a job, plus the renderer pid log.
 * Electron is only touched once a job starts.
 */
export function createPowerSaveRenderGuard(win: BrowserWindow): RenderActivityGuard {
  let blockerId: number | null = null

  return createRenderActivityGuard({
    onStart() {
      blockerId = powerSaveBlocker.start('prevent-app-suspension')
      console.log(
        '[Main] render job active: renderer pid=' +
          win.webContents.getOSProcessId() +
          ' powerSaveBlocker=' +
          blockerId,
      )
    },
    onStop() {
      if (blockerId !== null) powerSaveBlocker.stop(blockerId)
      blockerId = null
      console.log('[Main] render job idle: powerSaveBlocker released')
    },
  })
}
