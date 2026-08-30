/**
 * @file __test__/workerLauncherCrash.test.ts
 * @description Pin the worker_launcher global crash handlers.
 *
 * Verifies that when `self.dispatchEvent(new ErrorEvent('error', ...))` or
 * an unhandledrejection event fires inside the worker, the launcher posts
 * a `['__worker_crash__', payload]` message to the renderer side. This is
 * the contract WorkerTransport assumes when it routes such messages
 * through CrashReporter -- breaking either side silently loses visibility
 * for the user.
 *
 * The Web Worker `self` symbol is polyfilled to globalThis (jsdom) and the
 * heavy WorkerService / services modules are mocked so the launcher's
 * top-level side effects (`new WorkerService(...)`, `registerAllServices`)
 * are no-ops in the test environment.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/worker/server/WorkerService', () => ({
  WorkerService: vi.fn().mockImplementation(() => ({
    invoke: vi.fn(),
  })),
}))

vi.mock('@renderer/worker/server/services', () => ({
  registerAllServices: vi.fn(),
}))

const postMessageSpy = vi.fn()
const addEventListenerSpy = vi.spyOn(globalThis, 'addEventListener')

beforeAll(() => {
  ;(globalThis as { self?: unknown }).self = globalThis
  ;(globalThis as unknown as { postMessage: typeof postMessageSpy }).postMessage = postMessageSpy
  ;(globalThis as unknown as { close: () => void }).close = () => undefined
})

beforeEach(() => {
  postMessageSpy.mockClear()
})

describe('worker_launcher global crash handlers', () => {
  it('registers error and unhandledrejection listeners on self', async () => {
    await import('@renderer/worker/server/worker_launcher')
    const channels = addEventListenerSpy.mock.calls.map((c) => c[0])
    expect(channels).toContain('error')
    expect(channels).toContain('unhandledrejection')
  })

  it('posts a __worker_crash__ message when an error event fires', async () => {
    await import('@renderer/worker/server/worker_launcher')
    const evt = new Event('error') as ErrorEvent
    Object.defineProperty(evt, 'message', { value: 'sync throw' })
    Object.defineProperty(evt, 'error', { value: new Error('sync throw') })
    Object.defineProperty(evt, 'filename', { value: 'a.ts' })
    Object.defineProperty(evt, 'lineno', { value: 42 })
    Object.defineProperty(evt, 'colno', { value: 7 })

    globalThis.dispatchEvent(evt)

    const crash = postMessageSpy.mock.calls
      .map((c) => c[0])
      .find((m) => Array.isArray(m) && m[0] === '__worker_crash__')
    expect(crash).toBeDefined()
    const payload = (crash as [string, Record<string, unknown>])[1]
    expect(payload.message).toBe('sync throw')
    expect(payload.filename).toBe('a.ts')
    expect(payload.lineno).toBe(42)
    expect(payload.colno).toBe(7)
    expect(payload.type).toBe('error')
  })

  it('posts a __worker_crash__ message when an unhandledrejection fires', async () => {
    await import('@renderer/worker/server/worker_launcher')
    const reason = new Error('promise rejected')
    const evt = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(evt, 'reason', { value: reason })
    Object.defineProperty(evt, 'promise', { value: Promise.reject(reason).catch(() => undefined) })

    globalThis.dispatchEvent(evt)

    const crashes = postMessageSpy.mock.calls
      .map((c) => c[0])
      .filter((m) => Array.isArray(m) && m[0] === '__worker_crash__')
    const last = crashes[crashes.length - 1] as [string, Record<string, unknown>] | undefined
    expect(last).toBeDefined()
    expect((last as [string, Record<string, unknown>])[1].type).toBe('unhandledrejection')
    expect((last as [string, Record<string, unknown>])[1].message).toBe('promise rejected')
  })
})
