/**
 * @file renderer/crash/CrashReporter.ts
 * @description Renderer-side crash funnel.
 *
 * Every crash source (window.onerror, unhandledrejection, React
 * ErrorBoundary, worker.onerror, worker.onmessageerror, worker postMessage
 * '__worker_crash__', and the worker render-loop try-catch) reports here.
 * The first report wins -- subsequent reports are only logged. On first
 * report we (a) log to console (which the main process tee's to stderr via
 * the console-message hook), (b) forward to main via IPC.CRASH_REPORT so
 * componentStack and other non-console info also reach stderr, (c) mount
 * the DOM-direct fallback so the user sees the crash even when React died,
 * and (d) notify subscribers (React `ErrorBoundary` -> `CrashOverlay`).
 */

import { IPC } from '@shared/ipcChannels'
import type { CrashReport } from '@shared/ipcTypes'
import { mountFallbackDom } from './mountFallbackDom'

type Subscriber = (report: CrashReport) => void

let firstReport: CrashReport | null = null
const subscribers: Set<Subscriber> = new Set()

/**
 * Submit a crash report. Idempotent: the first call performs the full
 * routing (log + IPC + DOM mount + subscriber fanout); subsequent calls
 * only log so a crash storm (e.g. 60fps render-loop throw) does not flood
 * IPC or re-mount the fallback.
 */
export function report(payload: CrashReport): void {
  if (firstReport !== null) {
    console.error('[Crash][repeat][' + payload.source + ']', payload.message)
    return
  }
  firstReport = payload

  console.error('[Crash][' + payload.source + ']', payload.message)
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
