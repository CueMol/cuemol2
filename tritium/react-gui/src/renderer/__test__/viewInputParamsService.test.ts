/**
 * Degrade-detection tests for `viewInputParams` (worker service).
 *
 * Pins the two-step write mirrored from UXP `config-mouse.js`:
 *   - the live ViewInputConfig singleton is updated (vic.tbrad / vic.hitprec)
 *   - AND the value is persisted into the "user" style set under
 *     UserViewConf.<key> so it survives across sessions
 *   - only provided fields are touched; non-positive / non-finite are rejected
 */

import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/view/view.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const { getViewInputParams, setViewInputParams, setGpuPickEnabled } = services

function makeCtx(
    initial: { tbrad: number; hitprec: number } = { tbrad: 0.8, hitprec: 10.0 },
    opts: { vicMissing?: boolean } = {},
) {
    const setTbrad = vi.fn()
    const setHitprec = vi.fn()
    let tbrad = initial.tbrad
    let hitprec = initial.hitprec
    const setGpuPick = vi.fn()
    let gpuPick = true
    const vic = {
        get tbrad() { return tbrad },
        set tbrad(v: number) { tbrad = v; setTbrad(v) },
        get hitprec() { return hitprec },
        set hitprec(v: number) { hitprec = v; setHitprec(v) },
        get gpu_pick() { return gpuPick },
        set gpu_pick(v: boolean) { gpuPick = v; setGpuPick(v) },
    }
    const getService = vi.fn((name: string) =>
        opts.vicMissing ? null : name === 'ViewInputConfig' ? vic : null,
    )
    const setStyleValue = vi.fn()
    const ctx = {
        svc: { getService },
        styleMgr: { setStyleValue },
    } as unknown as WorkerContext
    return { ctx, vic, setTbrad, setHitprec, setGpuPick, setStyleValue, getService }
}

describe('setGpuPickEnabled', () => {
    // The GPU pick switch is a live-only write (persisted by the renderer in
    // electron-store, not in the user style file): the singleton flips, the
    // style set is untouched, and a missing singleton reports ok:false.
    it('flips ViewInputConfig.gpu_pick without touching the style set', () => {
        const { ctx, vic, setGpuPick, setStyleValue } = makeCtx()
        expect(setGpuPickEnabled(ctx, { enabled: false })).toEqual({ ok: true })
        expect(vic.gpu_pick).toBe(false)
        expect(setGpuPick).toHaveBeenCalledWith(false)
        expect(setStyleValue).not.toHaveBeenCalled()
        expect(setGpuPickEnabled(ctx, { enabled: true })).toEqual({ ok: true })
        expect(vic.gpu_pick).toBe(true)

        const missing = makeCtx(undefined, { vicMissing: true })
        expect(setGpuPickEnabled(missing.ctx, { enabled: false })).toEqual({ ok: false })
    })
})

describe('viewInputParams service', () => {
    describe('getViewInputParams', () => {
        it('reads tbrad / hitprec from the ViewInputConfig singleton', () => {
            const { ctx, getService } = makeCtx({ tbrad: 1.5, hitprec: 8 })
            expect(getViewInputParams(ctx, {})).toEqual({
                ok: true,
                params: { tbrad: 1.5, hitprec: 8 },
            })
            expect(getService).toHaveBeenCalledWith('ViewInputConfig')
        })

        it('returns ok:false when ViewInputConfig is unavailable', () => {
            const { ctx } = makeCtx(undefined, { vicMissing: true })
            expect(getViewInputParams(ctx, {}).ok).toBe(false)
        })
    })

    describe('setViewInputParams', () => {
        it('sets vic.tbrad live AND persists UserViewConf.tbrad; leaves hitprec untouched', () => {
            const { ctx, setTbrad, setHitprec, setStyleValue } = makeCtx()
            expect(setViewInputParams(ctx, { tbrad: 1.2 })).toEqual({ ok: true })
            expect(setTbrad).toHaveBeenCalledWith(1.2)
            expect(setStyleValue).toHaveBeenCalledWith(0, 'user', 'UserViewConf.tbrad', '1.2')
            expect(setHitprec).not.toHaveBeenCalled()
        })

        it('sets vic.hitprec live AND persists UserViewConf.hitprec', () => {
            const { ctx, setHitprec, setStyleValue } = makeCtx()
            setViewInputParams(ctx, { hitprec: 5 })
            expect(setHitprec).toHaveBeenCalledWith(5)
            expect(setStyleValue).toHaveBeenCalledWith(0, 'user', 'UserViewConf.hitprec', '5')
        })

        it('rejects non-positive and non-finite values (UXP > 0 guard)', () => {
            const { ctx, setTbrad, setHitprec, setStyleValue } = makeCtx()
            setViewInputParams(ctx, { tbrad: 0 })
            setViewInputParams(ctx, { tbrad: -1 })
            setViewInputParams(ctx, { hitprec: Number.NaN })
            expect(setTbrad).not.toHaveBeenCalled()
            expect(setHitprec).not.toHaveBeenCalled()
            expect(setStyleValue).not.toHaveBeenCalled()
        })

        it('returns ok:false when ViewInputConfig is unavailable', () => {
            const { ctx } = makeCtx(undefined, { vicMissing: true })
            expect(setViewInputParams(ctx, { tbrad: 1.2 }).ok).toBe(false)
        })
    })
})
