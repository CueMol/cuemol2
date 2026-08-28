/**
 * @file __test__/crashSeverity.test.ts
 * @description Pins which crash sources are fatal.
 *
 * `report()` used to treat every source alike: the first report -- whatever it
 * was -- mounted a full-screen overlay whose only control is Quit. Because
 * `installGlobalCrashHandlers` funnels *every* unhandled promise rejection into
 * it, one recoverable failure (a worker service rejecting, a `UI_SAVE` failing
 * on a full disk) replaced the working UI with a crash screen and the only way
 * back was to restart.
 *
 * A rejection is still reported -- logged and forwarded to main so it reaches
 * stderr -- but it must not take the app down, and it must not consume the
 * first-report slot that a genuine crash needs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CrashReport, CrashSource } from '@shared/types/crash'
import { IPC } from '@shared/ipcChannels'

const mountFallbackDom = vi.fn()
vi.mock('../crash/mountFallbackDom', () => ({
  mountFallbackDom: (r: CrashReport) => mountFallbackDom(r),
}))

function mkReport(source: CrashSource): CrashReport {
  return { source, message: `boom from ${source}`, timestamp: 1 }
}

let invoke: ReturnType<typeof vi.fn>

async function freshReporter() {
  vi.resetModules()
  return await import('../crash/CrashReporter')
}

beforeEach(() => {
  mountFallbackDom.mockClear()
  invoke = vi.fn(() => Promise.resolve())
  ;(globalThis as unknown as { electronAPI: unknown }).electronAPI = { invoke }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete (globalThis as unknown as { electronAPI?: unknown }).electronAPI
  vi.restoreAllMocks()
})

const FATAL: CrashSource[] = [
  'worker-global',
  'worker-message',
  'worker-render-loop',
  'react-error-boundary',
]
const NON_FATAL: CrashSource[] = ['window-error', 'window-unhandledrejection']

describe('crash severity', () => {
  it.each(FATAL)('%s mounts the fallback overlay', async (source) => {
    const { report } = await freshReporter()
    report(mkReport(source))
    expect(mountFallbackDom).toHaveBeenCalledTimes(1)
  })

  it.each(NON_FATAL)('%s does not mount the fallback overlay', async (source) => {
    const { report } = await freshReporter()
    report(mkReport(source))
    expect(mountFallbackDom).not.toHaveBeenCalled()
  })

  it.each(NON_FATAL)('%s is still reported to main', async (source) => {
    const { report } = await freshReporter()
    report(mkReport(source))
    expect(invoke).toHaveBeenCalledWith(IPC.CRASH_REPORT, expect.objectContaining({ source }))
  })

  it('a non-fatal report does not consume the slot a real crash needs', async () => {
    const { report, getCurrentCrash } = await freshReporter()
    report(mkReport('window-unhandledrejection'))
    expect(getCurrentCrash()).toBeNull()

    report(mkReport('worker-global'))
    expect(mountFallbackDom).toHaveBeenCalledTimes(1)
    expect(getCurrentCrash()?.source).toBe("worker-global")
  })

  it('subscribers are notified for a fatal crash only', async () => {
    const { report, subscribe } = await freshReporter()
    const seen: CrashSource[] = []
    subscribe((r) => { seen.push(r.source) })

    report(mkReport('window-unhandledrejection'))
    expect(seen).toEqual([])

    report(mkReport('react-error-boundary'))
    expect(seen).toEqual(['react-error-boundary'])
  })

  it('still reports only the first fatal crash', async () => {
    const { report } = await freshReporter()
    report(mkReport('worker-global'))
    report(mkReport('worker-message'))
    expect(mountFallbackDom).toHaveBeenCalledTimes(1)
  })
})
