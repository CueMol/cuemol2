/**
 * @file renderer/__test__/crashReporter.test.ts
 * @description Pin the CrashReporter wire contract.
 *
 * These tests are degrade-detectors: the four crash sources (worker, react,
 * window.onerror, unhandledrejection) all go through `report()` and rely on
 * it routing the FIRST call to log + IPC + DOM + subscribers, and silently
 * dropping subsequent calls. A future refactor that re-orders these steps
 * or breaks idempotency would break crash visibility for the user.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipcChannels'
import type { CrashReport } from '@shared/ipcTypes'
import {
  _resetForTests,
  getCurrentCrash,
  report,
  subscribe,
} from '../crash/CrashReporter'
import { setupElectronAPI, teardownElectronAPI } from './helpers/testHarness'

function makeReport(overrides: Partial<CrashReport> = {}): CrashReport {
  return {
    source: 'window-error',
    message: 'boom',
    timestamp: 1234,
    ...overrides,
  }
}

describe('CrashReporter', () => {
  beforeEach(() => {
    _resetForTests()
    // Remove any DOM fallback left over from previous tests.
    document.getElementById('crash-fallback-dom')?.remove()
    document.getElementById('crash-fallback-react')?.remove()
    teardownElectronAPI()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('forwards the first report to electronAPI.invoke(IPC.CRASH_REPORT)', () => {
    const api = setupElectronAPI()
    const payload = makeReport({ source: 'worker-global', message: 'native abort' })
    report(payload)
    expect(api.invoke).toHaveBeenCalledWith(IPC.CRASH_REPORT, payload)
  })

  it('mounts the DOM-direct fallback on the first report', () => {
    setupElectronAPI()
    report(makeReport())
    expect(document.getElementById('crash-fallback-dom')).not.toBeNull()
  })

  it('first-wins: a second report does not re-mount or re-IPC', () => {
    const api = setupElectronAPI()
    report(makeReport({ message: 'first' }))
    const dom = document.getElementById('crash-fallback-dom')
    expect(dom).not.toBeNull()
    expect(api.invoke).toHaveBeenCalledTimes(1)

    report(makeReport({ message: 'second' }))
    expect(api.invoke).toHaveBeenCalledTimes(1)
    expect(document.getElementById('crash-fallback-dom')).toBe(dom)
    expect(getCurrentCrash()?.message).toBe('first')
  })

  it('notifies subscribers on first report', () => {
    setupElectronAPI()
    const cb = vi.fn()
    subscribe(cb)
    report(makeReport({ message: 'fire' }))
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0].message).toBe('fire')
  })

  it('invokes a late subscriber synchronously with the stored payload', () => {
    setupElectronAPI()
    report(makeReport({ message: 'already-fired' }))
    const cb = vi.fn()
    subscribe(cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0].message).toBe('already-fired')
  })

  it('does not throw when electronAPI is absent', () => {
    expect(() => report(makeReport())).not.toThrow()
    // Console error still happens so the user gets *some* visibility.
    expect(document.getElementById('crash-fallback-dom')).not.toBeNull()
  })

  it('does not throw when electronAPI.invoke rejects', async () => {
    setupElectronAPI({ invoke: vi.fn().mockRejectedValue(new Error('ipc broken')) })
    expect(() => report(makeReport())).not.toThrow()
    // Allow the rejection handler to settle.
    await Promise.resolve()
  })
})
