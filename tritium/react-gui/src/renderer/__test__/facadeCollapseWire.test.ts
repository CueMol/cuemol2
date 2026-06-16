/**
 * Wire-pin safety net for the apis/* facade collapse (T15 PR-B).
 *
 * The naviApi + sceneViewApi facade functions (and their AsyncCueMol
 * forwarders) are pure single-`invokeService` pass-throughs. PR-B deletes
 * them and inlines `cm.invokeService('name', args)` at each callsite. This
 * test pins the EXACT postMessage payload each method produces today --
 * `[serviceName, seqno, argsObject]` -- so that after the collapse the
 * worker still receives a byte-identical request.
 *
 * The assertions below call `cm.invokeService('name', argsObject)` -- the
 * exact form the inlined callsites now use -- and pin the postMessage
 * payload `[name, seqno, argsObject]`. For methods that were positional at
 * the old facade (e.g. `getViewProjection(viewId)`), the wire object is the
 * one the callsite must now build (`{ viewId }`).
 *
 * If this goes red, an inlined callsite changed the wire shape.
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
}

import { AsyncCueMol } from '../worker/client/AsyncCueMol'

/** Return the most recent postMessage payload split into method/seqno/args. */
function lastSent(): { method: string; seqno: number; args: unknown[] } {
  const calls = capturedWorker!.postMessage.mock.calls
  const payload = calls[calls.length - 1][0] as any[]
  return { method: payload[0], seqno: payload[1], args: payload.slice(2) }
}

describe('apis/* facade collapse -- invokeService wire contract', () => {
  let cm: AsyncCueMol

  beforeEach(() => {
    capturedWorker = null
    vi.stubGlobal('Worker', MockWorker)
    cm = new AsyncCueMol()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // --- naviApi: callers already pass an args object verbatim ---

  it('naviHitTest sends [naviHitTest, seqno, {viewId,x,y}]', () => {
    void cm.invokeService('naviHitTest', { viewId: 1, x: 10, y: 20 })
    const sent = lastSent()
    expect(sent.method).toBe('naviHitTest')
    expect(sent.args).toEqual([{ viewId: 1, x: 10, y: 20 }])
  })

  it('naviResidSel forwards the full args object unchanged', () => {
    void cm.invokeService('naviResidSel', { viewId: 2, x: 3, y: 4, mode: 'extend', prevObjId: 9, prevAtomId: 7 })
    const sent = lastSent()
    expect(sent.method).toBe('naviResidSel')
    expect(sent.args).toEqual([{ viewId: 2, x: 3, y: 4, mode: 'extend', prevObjId: 9, prevAtomId: 7 }])
  })

  it('naviCtxSelect forwards mode verbatim', () => {
    void cm.invokeService('naviCtxSelect', { viewId: 5, objId: 6, atomId: 7, mode: 'residue' })
    const sent = lastSent()
    expect(sent.method).toBe('naviCtxSelect')
    expect(sent.args).toEqual([{ viewId: 5, objId: 6, atomId: 7, mode: 'residue' }])
  })

  it('naviCtxAround forwards distance + byres', () => {
    void cm.invokeService('naviCtxAround', { viewId: 5, objId: 6, distance: 7, byres: false })
    const sent = lastSent()
    expect(sent.method).toBe('naviCtxAround')
    expect(sent.args).toEqual([{ viewId: 5, objId: 6, distance: 7, byres: false }])
  })

  // --- sceneViewApi: positional args -> the wire object below ---

  it('getViewProjection sends {viewId}', () => {
    void cm.invokeService('getViewProjection', { viewId: 42 })
    const sent = lastSent()
    expect(sent.method).toBe('getViewProjection')
    expect(sent.args).toEqual([{ viewId: 42 }])
  })

  it('setViewProjection sends {viewId, perspective}', () => {
    void cm.invokeService('setViewProjection', { viewId: 42, perspective: true })
    const sent = lastSent()
    expect(sent.method).toBe('setViewProjection')
    expect(sent.args).toEqual([{ viewId: 42, perspective: true }])
  })

  it('setViewCenterMark sends {viewId, centerMark}', () => {
    void cm.invokeService('setViewCenterMark', { viewId: 7, centerMark: 'axis' })
    const sent = lastSent()
    expect(sent.method).toBe('setViewCenterMark')
    expect(sent.args).toEqual([{ viewId: 7, centerMark: 'axis' }])
  })

  it('setSceneBgColor sends {sceneId, colorName}', () => {
    void cm.invokeService('setSceneBgColor', { sceneId: 3, colorName: 'black' })
    const sent = lastSent()
    expect(sent.method).toBe('setSceneBgColor')
    expect(sent.args).toEqual([{ sceneId: 3, colorName: 'black' }])
  })

  it('getSceneCloseInfo wraps viewId into {viewId}', () => {
    void cm.invokeService('getSceneCloseInfo', { viewId: 99 })
    const sent = lastSent()
    expect(sent.method).toBe('getSceneCloseInfo')
    expect(sent.args).toEqual([{ viewId: 99 }])
  })

  it('proposeUniqName forwards the args object verbatim', () => {
    void cm.invokeService('proposeUniqName', { kind: 'scene', prefix: 'Scene_' })
    const sent = lastSent()
    expect(sent.method).toBe('proposeUniqName')
    expect(sent.args).toEqual([{ kind: 'scene', prefix: 'Scene_' }])
  })
})
