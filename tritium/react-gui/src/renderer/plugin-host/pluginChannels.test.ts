/**
 * @file plugin-host/pluginChannels.test.ts
 * @description The plugin push lane's wire contract.
 *
 * Pins the one thing that can silently break: a push channel name and a
 * service reply arrive on the same `onmessage` and are told apart only by
 * their prefixes. Get that wrong in either direction and a push is dropped as
 * an orphan reply, or a reply never reaches the caller waiting on it -- both
 * without an error.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

let capturedWorker: MockWorker | null = null

class MockWorker {
  onmessage: ((ev: MessageEvent) => unknown) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor(_url: unknown) { capturedWorker = this }
  push(...data: unknown[]): void {
    this.onmessage?.({ data } as MessageEvent)
  }
}

import { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { definePluginChannel } from './pluginChannels'

describe('the plugin push channel lane', () => {
  let cm: AsyncCueMol

  beforeEach(() => {
    capturedWorker = null
    vi.stubGlobal('Worker', MockWorker)
    cm = new AsyncCueMol()
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('routes a push to its subscribers and stops on unsubscribe', () => {
    const channel = definePluginChannel<{ n: number }>('demo', 'progress')
    expect(channel.channel).toBe('plugin-channel.demo.progress')

    const seen: unknown[] = []
    const unsubscribe = channel.subscribe(cm, (payload) => seen.push(payload))

    capturedWorker!.push(channel.channel, { n: 1 })
    expect(seen).toEqual([{ n: 1 }])

    // A service REPLY uses the other prefix and must not reach the listener:
    // it belongs to whoever is awaiting that call.
    capturedWorker!.push('plugin.demo.doThing', 7, true, { n: 99 })
    expect(seen).toEqual([{ n: 1 }])

    // Another plugin's channel is a different name, so it is not delivered.
    capturedWorker!.push('plugin-channel.other.progress', { n: 2 })
    expect(seen).toEqual([{ n: 1 }])

    unsubscribe()
    capturedWorker!.push(channel.channel, { n: 3 })
    expect(seen).toEqual([{ n: 1 }])
  })
})
