/**
 * @file __test__/workerTransportOnerror.test.ts
 * @description Pin WorkerTransport crash funnel.
 *
 * Three signals must all be routed to CrashReporter.report:
 *   - native `Worker.onerror` (runtime-level termination)
 *   - native `Worker.onmessageerror` (postMessage deserialization failure)
 *   - inbound `['__worker_crash__', payload]` message (worker_launcher.ts
 *     global handler / gfx_manager render-loop try-catch)
 *
 * After any of them fires, `isCrashed()` must flip to true so further
 * `invokeWorker` calls reject synchronously instead of hanging.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

vi.mock('@renderer/crash/CrashReporter', () => ({
  report: vi.fn(),
}))

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  onmessageerror: ((e: MessageEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  addEventListener(): void { /* unused */ }
  removeEventListener(): void { /* unused */ }
  dispatchEvent(): boolean { return true }
}

const originalWorker = (globalThis as { Worker?: unknown }).Worker
beforeEach(() => {
  ;(globalThis as { Worker?: unknown }).Worker = FakeWorker
  vi.clearAllMocks()
})

afterAllRestoreWorker()
function afterAllRestoreWorker(): void {
  /* keep symbol present for clarity; restored in afterEach below */
}

import { afterEach } from 'vitest'
afterEach(() => {
  if (originalWorker === undefined) {
    delete (globalThis as { Worker?: unknown }).Worker
  } else {
    ;(globalThis as { Worker?: unknown }).Worker = originalWorker
  }
})

import { WorkerTransport } from '@renderer/worker/client/WorkerTransport'
import * as CrashReporter from '@renderer/crash/CrashReporter'

function makeTransport(): { transport: WorkerTransport; worker: FakeWorker } {
  const transport = new WorkerTransport({ onEventNotify: vi.fn() })
  // @ts-expect-error -- private field access for white-box assertion
  const worker = transport._worker as unknown as FakeWorker
  return { transport, worker }
}

describe('WorkerTransport crash funnel', () => {
  it('reports worker.onerror as source=worker-global', () => {
    const { transport, worker } = makeTransport()
    const fakeError = new Error('worker blew up')
    worker.onerror?.({
      message: 'worker blew up',
      error: fakeError,
      filename: 'a.ts',
      lineno: 12,
      colno: 3,
    } as unknown as ErrorEvent)
    expect(CrashReporter.report).toHaveBeenCalledTimes(1)
    const payload = (CrashReporter.report as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.source).toBe('worker-global')
    expect(payload.message).toBe('worker blew up')
    expect(payload.filename).toBe('a.ts')
    expect(payload.lineno).toBe(12)
    expect(transport.isCrashed()).toBe(true)
  })

  it('reports worker.onmessageerror as source=worker-global', () => {
    const { transport, worker } = makeTransport()
    worker.onmessageerror?.({} as unknown as MessageEvent)
    expect(CrashReporter.report).toHaveBeenCalledTimes(1)
    const payload = (CrashReporter.report as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.source).toBe('worker-global')
    expect(transport.isCrashed()).toBe(true)
  })

  it('reports __worker_crash__ render-loop message as source=worker-render-loop', () => {
    const { transport, worker } = makeTransport()
    worker.onmessage?.({
      data: ['__worker_crash__', {
        message: 'render fault',
        stack: 'at render',
        type: 'render-loop',
      }],
    } as MessageEvent)
    expect(CrashReporter.report).toHaveBeenCalledTimes(1)
    const payload = (CrashReporter.report as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.source).toBe('worker-render-loop')
    expect(payload.message).toBe('render fault')
    expect(transport.isCrashed()).toBe(true)
  })

  it('reports __worker_crash__ launcher message as source=worker-message', () => {
    const { transport, worker } = makeTransport()
    worker.onmessage?.({
      data: ['__worker_crash__', {
        message: 'unhandled rejection',
        type: 'unhandledrejection',
      }],
    } as MessageEvent)
    expect(CrashReporter.report).toHaveBeenCalledTimes(1)
    const payload = (CrashReporter.report as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.source).toBe('worker-message')
    expect(transport.isCrashed()).toBe(true)
  })

  it('terminates the worker after a crash so further calls fail fast', () => {
    const { transport, worker } = makeTransport()
    worker.onerror?.({ message: 'boom' } as unknown as ErrorEvent)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(transport.isReady()).toBe(false)
  })

  it('invokeWorker rejects synchronously after a crash', async () => {
    const { transport, worker } = makeTransport()
    worker.onerror?.({ message: 'boom' } as unknown as ErrorEvent)
    await expect(transport.invokeWorker('anyMethod', 'arg'))
      .rejects.toThrow(/Worker has crashed/)
  })

  it('only reports the first crash even if multiple signals arrive', () => {
    const { worker } = makeTransport()
    worker.onerror?.({ message: 'first' } as unknown as ErrorEvent)
    worker.onmessageerror?.({} as unknown as MessageEvent)
    worker.onmessage?.({
      data: ['__worker_crash__', { message: 'third', type: 'error' }],
    } as MessageEvent)
    expect(CrashReporter.report).toHaveBeenCalledTimes(1)
  })
})
