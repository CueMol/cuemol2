/**
 * @file renderer/crash/installGlobalCrashHandlers.ts
 * @description Wire window.onerror / unhandledrejection into CrashReporter.
 *
 * Called once from `renderer/index.tsx` before the React tree is rendered
 * so a synchronous throw in any Provider's constructor / first effect is
 * still captured. ErrorBoundary covers the React-render-path; this covers
 * everything else (timers, event handlers, async without `.catch`).
 */

import { report } from './CrashReporter'

export function installGlobalCrashHandlers(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (e: ErrorEvent) => {
    report({
      source: 'window-error',
      message: e.message || String(e.error ?? '(unknown error)'),
      stack: e.error instanceof Error ? e.error.stack : undefined,
      filename: e.filename || undefined,
      lineno: e.lineno || undefined,
      colno: e.colno || undefined,
      timestamp: Date.now(),
    })
  })

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason
    const message = reason instanceof Error
      ? reason.message
      : (typeof reason === 'string' ? reason : String(reason))
    report({
      source: 'window-unhandledrejection',
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: Date.now(),
    })
  })
}
