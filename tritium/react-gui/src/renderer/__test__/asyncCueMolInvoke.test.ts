/**
 * Degrade-detection test for AsyncCueMol invokeWorker contract.
 *
 * Refactor target: C (ServiceMap + MethodMap typing). After C, invokeWorker
 * becomes generic over a ServiceMap. The runtime wire format
 * (postMessage payload, response shape [method, seqno, ok, ...result]) must
 * stay identical so that the worker side is unaffected.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class { constructor() {} } }))

let capturedWorker: MockWorker | null = null

class MockWorker {
  onmessage: ((ev: MessageEvent) => any) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor(_url: any) { capturedWorker = this }
  respond(method: string, seqno: number, ok: boolean, ...result: any[]): void {
    this.onmessage?.({ data: [method, seqno, ok, ...result] } as MessageEvent)
  }
}

import { AsyncCueMol } from '../worker/client/AsyncCueMol'

function lastSent(): { method: string; seqno: number; args: unknown[] } {
  const calls = capturedWorker!.postMessage.mock.calls
  const payload = calls[calls.length - 1][0] as any[]
  return { method: payload[0], seqno: payload[1], args: payload.slice(2) }
}

describe('AsyncCueMol.invokeWorker -- wire contract', () => {
  let cm: AsyncCueMol

  beforeEach(() => {
    capturedWorker = null
    vi.stubGlobal('Worker', MockWorker)
    cm = new AsyncCueMol()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('postMessage payload is [method, seqno, ...args]', () => {
    cm.invokeWorker('myService', { foo: 1 }, 42)
    const sent = lastSent()
    expect(sent.method).toBe('myService')
    expect(typeof sent.seqno).toBe('number')
    expect(sent.args).toEqual([{ foo: 1 }, 42])
  })

  it('successful response resolves with the full result tail array', async () => {
    const promise = cm.invokeWorker('svc')
    const sent = lastSent()
    capturedWorker!.respond(sent.method, sent.seqno, true, 'a', 'b', 3)
    const result = await promise
    expect(result).toEqual(['a', 'b', 3])
  })

  it('failed response rejects with the error message', async () => {
    const promise = cm.invokeWorker('svc')
    const sent = lastSent()
    capturedWorker!.respond(sent.method, sent.seqno, false, 'boom')
    await expect(promise).rejects.toBeDefined()
  })

  it('seqno increments per call', () => {
    cm.invokeWorker('a')
    const s1 = lastSent().seqno
    cm.invokeWorker('b')
    const s2 = lastSent().seqno
    expect(s2).toBeGreaterThan(s1)
  })

  it('concurrent calls resolve independently in any order', async () => {
    const p1 = cm.invokeWorker('first')
    const sent1 = lastSent()
    const p2 = cm.invokeWorker('second')
    const sent2 = lastSent()

    capturedWorker!.respond(sent2.method, sent2.seqno, true, 'second-result')
    capturedWorker!.respond(sent1.method, sent1.seqno, true, 'first-result')

    expect(await p1).toEqual(['first-result'])
    expect(await p2).toEqual(['second-result'])
  })

  it('invokeWorkerWithTransfer routes the same wire format with transfer list', () => {
    const buf = new ArrayBuffer(8)
    // Per WorkerTransport.postMessage, the `transfer` arg is a single
    // transferable that the implementation wraps as [transfer] for postMessage.
    cm.invokeWorkerWithTransfer('bind', buf, buf, 1)
    const calls = capturedWorker!.postMessage.mock.calls
    const lastCall = calls[calls.length - 1]
    const payload = lastCall[0] as any[]
    expect(payload[0]).toBe('bind')
    expect(typeof payload[1]).toBe('number')
    expect(payload.slice(2)).toEqual([buf, 1])
    // second arg to postMessage is the transfer list (always [xfer]).
    expect(lastCall[1]).toEqual([buf])
  })
})
