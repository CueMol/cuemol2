/**
 * Degrade-detection tests for `sceneRenderOpts` (worker service backing
 * `RenderingPane`).
 *
 * Pins the wire contract:
 *   - getSceneRenderOpts reads AO/AA props, the bgcolor as #rrggbb, and the
 *     enum props (aa_method / icc_intent) as their string id
 *   - setSceneRenderOpts writes ONLY the patched fields, with enum/colour casts
 *   - undo bracketing per mode: single -> start+commit around the write;
 *     begin -> start (no commit); live -> neither; end -> commit; cancel -> rollback
 *   - missing scene -> { ok: false }
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import { services } from '../worker/server/services/sceneRenderOpts.service'

const { getSceneRenderOpts, setSceneRenderOpts } = services

function makeScene(over: Record<string, unknown> = {}) {
    const v: Record<string, unknown> = {
        aoEnabled: false,
        aoRadius: 4,
        aoIntensity: 2.2,
        aoSlices: 9,
        aoSteps: 3,
        aoHalfRes: false,
        aa_method: 'fxaa',
        aaJitterLevel: 0,
        use_colproof: false,
        icc_filename: '',
        icc_intent: 'perceptual',
        bg: { r: 255, g: 128, b: 0 },
        ...over,
    }
    const start = vi.fn()
    const commit = vi.fn()
    const rollback = vi.fn()
    const setBgColor = vi.fn()
    const scene = {
        get aoEnabled() { return v.aoEnabled },
        set aoEnabled(x) { v.aoEnabled = x },
        get aoRadius() { return v.aoRadius },
        set aoRadius(x) { v.aoRadius = x },
        get aoIntensity() { return v.aoIntensity },
        set aoIntensity(x) { v.aoIntensity = x },
        get aoSlices() { return v.aoSlices },
        set aoSlices(x) { v.aoSlices = x },
        get aoSteps() { return v.aoSteps },
        set aoSteps(x) { v.aoSteps = x },
        get aoHalfRes() { return v.aoHalfRes },
        set aoHalfRes(x) { v.aoHalfRes = x },
        get aa_method() { return v.aa_method },
        set aa_method(x) { v.aa_method = x },
        get aaJitterLevel() { return v.aaJitterLevel },
        set aaJitterLevel(x) { v.aaJitterLevel = x },
        get use_colproof() { return v.use_colproof },
        set use_colproof(x) { v.use_colproof = x },
        get icc_filename() { return v.icc_filename },
        set icc_filename(x) { v.icc_filename = x },
        get icc_intent() { return v.icc_intent },
        set icc_intent(x) { v.icc_intent = x },
        get bgcolor() {
            const c = v.bg as { r: number; g: number; b: number }
            return { r: () => c.r, g: () => c.g, b: () => c.b }
        },
        set bgcolor(c) { setBgColor(c) },
        get uid() { return 7 },
        startUndoTxn: start,
        commitUndoTxn: commit,
        rollbackUndoTxn: rollback,
    }
    return { scene, v, start, commit, rollback, setBgColor }
}

function makeCtx(scene: unknown, compiled: unknown = { __color: true }): WorkerContext {
    return {
        sceMgr: { getScene: vi.fn(() => scene) },
        styleMgr: { compileColor: vi.fn(() => compiled) },
    } as unknown as WorkerContext
}

describe('sceneRenderOpts.getSceneRenderOpts', () => {
    it('reads AO/AA props, bgcolor hex, and enum string ids', () => {
        const { scene } = makeScene()
        const res = getSceneRenderOpts(makeCtx(scene), { sceneId: 1 })
        expect(res).toEqual({
            ok: true,
            aoEnabled: false,
            aoRadius: 4,
            aoIntensity: 2.2,
            aoSlices: 9,
            aoSteps: 3,
            aoHalfRes: false,
            aaMethod: 'fxaa',
            aaJitterLevel: 0,
            bgColor: '#ff8000',
            useColProof: false,
            iccFilename: '',
            iccIntent: 'perceptual',
        })
    })

    it('returns ok:false when the scene is missing', () => {
        expect(getSceneRenderOpts(makeCtx(null), { sceneId: 1 }).ok).toBe(false)
    })
})

describe('sceneRenderOpts.setSceneRenderOpts', () => {
    it('writes only the patched fields (single mode) inside one undo txn', () => {
        const { scene, v, start, commit } = makeScene()
        setSceneRenderOpts(makeCtx(scene), {
            sceneId: 1,
            patch: { aoEnabled: true, aoRadius: 6 },
            mode: 'single',
        })
        expect(v.aoEnabled).toBe(true)
        expect(v.aoRadius).toBe(6)
        expect(v.aoIntensity).toBe(2.2) // untouched
        expect(start).toHaveBeenCalledTimes(1)
        expect(commit).toHaveBeenCalledTimes(1)
    })

    it('casts enum patches to their string id', () => {
        const { scene, v } = makeScene()
        setSceneRenderOpts(makeCtx(scene), { sceneId: 1, patch: { aaMethod: 'smaa' } })
        expect(v.aa_method).toBe('smaa')
    })

    it('compiles the bgcolor hex and assigns scene.bgcolor', () => {
        const compiled = { __color: 'compiled' }
        const { scene, setBgColor } = makeScene()
        const ctx = makeCtx(scene, compiled)
        setSceneRenderOpts(ctx, { sceneId: 1, patch: { bgColor: '#102030' } })
        expect(ctx.styleMgr.compileColor).toHaveBeenCalledWith('#102030', 7)
        expect(setBgColor).toHaveBeenCalledWith(compiled)
    })

    it('begin opens a txn and writes, without committing', () => {
        const { scene, v, start, commit } = makeScene()
        setSceneRenderOpts(makeCtx(scene), { sceneId: 1, patch: { aoRadius: 5 }, mode: 'begin' })
        expect(start).toHaveBeenCalledTimes(1)
        expect(v.aoRadius).toBe(5)
        expect(commit).not.toHaveBeenCalled()
    })

    it('live writes without touching the txn', () => {
        const { scene, v, start, commit } = makeScene()
        setSceneRenderOpts(makeCtx(scene), { sceneId: 1, patch: { aoRadius: 7 }, mode: 'live' })
        expect(v.aoRadius).toBe(7)
        expect(start).not.toHaveBeenCalled()
        expect(commit).not.toHaveBeenCalled()
    })

    it('end writes and commits the open txn', () => {
        const { scene, v, commit } = makeScene()
        setSceneRenderOpts(makeCtx(scene), { sceneId: 1, patch: { aoRadius: 8 }, mode: 'end' })
        expect(v.aoRadius).toBe(8)
        expect(commit).toHaveBeenCalledTimes(1)
    })

    it('cancel rolls back the open txn without writing', () => {
        const { scene, v, rollback } = makeScene()
        setSceneRenderOpts(makeCtx(scene), { sceneId: 1, patch: { aoRadius: 9 }, mode: 'cancel' })
        expect(rollback).toHaveBeenCalledTimes(1)
        expect(v.aoRadius).toBe(4) // unchanged
    })

    it('returns ok:false when the scene is missing', () => {
        expect(
            setSceneRenderOpts(makeCtx(null), { sceneId: 1, patch: { aoEnabled: true } }).ok,
        ).toBe(false)
    })
})
