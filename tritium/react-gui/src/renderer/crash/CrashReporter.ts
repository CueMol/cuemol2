/**
 * @file renderer/crash/CrashReporter.ts
 * @description Renderer-side crash funnel.
 *
 * Every crash source (window.onerror, unhandledrejection, React
 * ErrorBoundary, worker.onerror, worker.onmessageerror, worker postMessage
 * '__worker_crash__', and the worker render-loop try-catch) reports here.
 *
 * Reports are split by severity. Everything is (a) logged to console -- which
 * the main process tee's to stderr via the console-message hook -- and (b)
 * forwarded to main via IPC.CRASH_REPORT so componentStack and other
 * non-console fields reach stderr too.
 *
 * Only a FATAL source additionally (c) mounts the DOM-direct fallback so the
 * user sees the crash even when React died, and (d) notifies subscribers
 * (React `ErrorBoundary` -> `CrashOverlay`). Fatal means the app cannot carry
 * on: the CueMol worker is gone, or the React tree is. A stray uncaught
 * throw or unhandled rejection is neither -- `installGlobalCrashHandlers`
 * funnels every one of them here, and the overlay has no way back, so
 * treating them as fatal turned any recoverable failure (a worker service
 * rejecting, a settings write failing on a full disk) into a dead session.
 *
 * The first FATAL report wins; later ones are only logged. A non-fatal report
 * never occupies that slot.
 */

import { IPC } from '@shared/ipcChannels'
import type { CrashReport, CrashSource } from '@shared/ipcTypes'
import { mountFallbackDom } from './mountFallbackDom'

type Subscriber = (report: CrashReport) => void

/**
 * Sources that mean the app cannot continue, so the crash overlay is the
 * right answer. Everything else is reported but left recoverable.
 */
const FATAL_SOURCES: ReadonlySet<CrashSource> = new Set<CrashSource>([
  'worker-global',
  'worker-message',
  'worker-render-loop',
  'react-error-boundary',
])

let firstReport: CrashReport | null = null
const subscribers: Set<Subscriber> = new Set()

/**
 * Submit a crash report. Idempotent: the first call performs the full
 * routing (log + IPC + DOM mount + subscriber fanout); subsequent calls
 * only log so a crash storm (e.g. 60fps render-loop throw) does not flood
 * IPC or re-mount the fallback.
 */
export function report(payload: CrashReport): void {
  const fatal = FATAL_SOURCES.has(payload.source)
  if (fatal && firstReport !== null) {
    console.error('[Crash][repeat][' + payload.source + ']', payload.message)
    return
  }
  if (fatal) firstReport = payload

  console.error('[' + (fatal ? 'Crash' : 'Error') + '][' + payload.source + ']', payload.message)
  if (payload.filename) {
    const loc = payload.lineno !== undefined
      ? `${payload.filename}:${payload.lineno}:${payload.colno ?? 0}`
      : payload.filename
    console.error('  at', loc)
  }
  if (payload.stack) console.error(payload.stack)
  if (payload.componentStack) {
    console.error('Component stack:' + payload.componentStack)
  }

  // Forward to main so the stack ends up in stderr even when DevTools is
  // closed (and so componentStack / IPC-only fields are not lost).
  try {
    const api = (globalThis as { electronAPI?: { invoke: (c: string, p: unknown) => Promise<void> } }).electronAPI
      ?? (typeof window !== 'undefined'
        ? (window as unknown as { electronAPI?: { invoke: (c: string, p: unknown) => Promise<void> } }).electronAPI
        : undefined)
    api?.invoke(IPC.CRASH_REPORT, payload).catch((e: unknown) => {
      console.error('[Crash] IPC.CRASH_REPORT failed:', e)
    })
  } catch (e) {
    console.error('[Crash] IPC.CRASH_REPORT threw:', e)
  }

  // A non-fatal report stops here: it has been logged and forwarded, and the
  // app keeps running.
  if (!fatal) return

  // DOM-direct fallback so the user sees the crash even when React died.
  try {
    mountFallbackDom(payload)
  } catch (e) {
    console.error('[Crash] mountFallbackDom failed:', e)
  }

  // Fan out to React subscribers (CrashOverlay via ErrorBoundary).
  for (const cb of subscribers) {
    try { cb(payload) } catch (e) { console.error('[Crash] subscriber threw:', e) }
  }
}

/**
 * Subscribe to crash notifications. The callback fires on the first crash
 * only. If a crash has already been reported, the callback is invoked
 * synchronously with the stored payload so late-mounted React boundaries
 * can still render the overlay.
 *
 * @returns Unsubscribe function.
 */
export function subscribe(cb: Subscriber): () => void {
  subscribers.add(cb)
  if (firstReport !== null) {
    try { cb(firstReport) } catch (e) { console.error('[Crash] subscriber threw:', e) }
  }
  return () => { subscribers.delete(cb) }
}

/** Current crash payload (the first one reported), or null. */
export function getCurrentCrash(): CrashReport | null {
  return firstReport
}

/**
 * Reset for tests. Not exported from any public surface besides the test
 * suite -- production code never resets after a crash.
 */
export function _resetForTests(): void {
  firstReport = null
  subscribers.clear()
}
