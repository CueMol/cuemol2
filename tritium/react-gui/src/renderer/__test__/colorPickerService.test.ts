/**
 * Degrade-detection tests for the `colorPicker` worker service.
 *
 * Pins the StyleManager contract the colour picker depends on:
 *   - compileColor routes the string + scope to `styleMgr.compileColor`
 *     and surfaces RGB / className / gamut info
 *   - an in-gamut colour reports inGamut=true with no device RGB
 *   - an out-of-gamut colour decodes the device code into devR/G/B
 *   - getNamedColors merges scene-scoped then global definitions, each
 *     resolved via `styleMgr.getColor`
 *   - a colour string the StyleManager rejects yields { ok: false }
 *
 * The service runs in the worker thread where wrappers are synchronous, so
 * the StyleManager is mocked as a plain object.
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import { services } from '../worker/server/services/colorPicker.service'

function makeColorObj(
    r: number,
    g: number,
    b: number,
    opts: { className?: string; inGamut?: boolean; devCode?: number } = {},
) {
    return {
        r: () => r,
        g: () => g,
        b: () => b,
        getClassName: () => opts.className ?? 'Color',
        isInGamut: () => opts.inGamut ?? true,
        getDevCode: () => opts.devCode ?? 0,
    }
}

function makeCtx(styleMgr: Record<string, unknown>): WorkerContext {
    return { styleMgr } as unknown as WorkerContext
}

describe('colorPicker.compileColor', () => {
    it('resolves RGB, hex and className for an in-gamut colour', () => {
        const compileColor = vi.fn(() => makeColorObj(0, 0, 255, { className: 'NamedColor' }))
        const ctx = makeCtx({ compileColor })

        const res = services.compileColor(ctx, { colorStr: 'blue', sceneId: 7 })

        expect(compileColor).toHaveBeenCalledWith('blue', 7)
        expect(res).toMatchObject({
            ok: true,
            r: 0,
            g: 0,
            b: 255,
            hex: '#0000ff',
            className: 'NamedColor',
            inGamut: true,
        })
        expect(res.devR).toBeUndefined()
    })

    it('decodes device RGB when the colour is out of gamut', () => {
        const devCode = (0x11 << 16) | (0x22 << 8) | 0x33
        const compileColor = vi.fn(() =>
            makeColorObj(255, 0, 0, { inGamut: false, devCode }),
        )
        const ctx = makeCtx({ compileColor })

        const res = services.compileColor(ctx, { colorStr: '#ff0000', sceneId: 0 })

        expect(res.inGamut).toBe(false)
        expect(res.devR).toBe(0x11)
        expect(res.devG).toBe(0x22)
        expect(res.devB).toBe(0x33)
    })

    it('returns ok:false when the StyleManager rejects the string', () => {
        const compileColor = vi.fn(() => {
            throw new Error('bad color')
        })
        const ctx = makeCtx({ compileColor })

        expect(services.compileColor(ctx, { colorStr: 'nope', sceneId: 0 })).toEqual({
            ok: false,
        })
    })
})

describe('colorPicker.getNamedColors', () => {
    it('merges scene then global defs, each resolved via getColor', () => {
        const getColorDefsJSON = vi.fn((sceneId: number) =>
            sceneId === 5 ? JSON.stringify(['scenered']) : JSON.stringify(['aqua']),
        )
        const getColor = vi.fn((name: string) =>
            name === 'scenered' ? makeColorObj(255, 0, 0) : makeColorObj(0, 255, 255),
        )
        const ctx = makeCtx({ getColorDefsJSON, getColor })

        const res = services.getNamedColors(ctx, { sceneId: 5 })

        expect(getColorDefsJSON).toHaveBeenCalledWith(5)
        expect(getColorDefsJSON).toHaveBeenCalledWith(0)
        expect(res.scene).toEqual([{ name: 'scenered', r: 255, g: 0, b: 0, hex: '#ff0000' }])
        expect(res.global).toEqual([{ name: 'aqua', r: 0, g: 255, b: 255, hex: '#00ffff' }])
    })

    it('skips the scene scope when sceneId is 0', () => {
        const getColorDefsJSON = vi.fn(() => JSON.stringify(['aqua']))
        const getColor = vi.fn(() => makeColorObj(0, 255, 255))
        const ctx = makeCtx({ getColorDefsJSON, getColor })

        const res = services.getNamedColors(ctx, { sceneId: 0 })

        expect(res.scene).toEqual([])
        expect(getColorDefsJSON).not.toHaveBeenCalledWith(5)
    })
})
