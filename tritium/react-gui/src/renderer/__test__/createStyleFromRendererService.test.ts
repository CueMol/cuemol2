import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '@renderer/worker/server/services/rend/rend.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

interface FixtureOpts {
    /** Mock JSON returned by StyleManager.getStyleSetsJSON keyed by scopeId. */
    styleSetsJSON?: Record<number, string>
    /** Renderer type_name. */
    typeName?: string
    /** Renderer name. */
    rendName?: string
    /** Whether scene.getRenderer returns the renderer. */
    rendExists?: boolean
    /** Whether scene lookup succeeds. */
    sceneExists?: boolean
    /** When false, getService('StyleManager') returns null. */
    hasStyleMgr?: boolean
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        styleSetsJSON = {},
        typeName = 'cartoon',
        rendName = 'rend1',
        rendExists = true,
        sceneExists = true,
        hasStyleMgr = true,
    } = opts

    const rend = {
        get name() { return rendName },
        get type_name() { return typeName },
    }
    const scene = {
        getRenderer: vi.fn(() => (rendExists ? rend : null)),
    }
    const getStyleSetsJSON = vi.fn(
        (scopeId: number) => styleSetsJSON[scopeId] ?? '[]',
    )
    const createStyleFromObj = vi.fn()
    const styleMgr = { getStyleSetsJSON, createStyleFromObj }
    const getService = vi.fn(() => (hasStyleMgr ? styleMgr : null))

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
        svc: { getService },
    } as unknown as WorkerContext

    return {
        ctx, rend, scene, styleMgr,
        getStyleSetsJSON, createStyleFromObj, getService,
    }
}

describe('getCreateRendStyleInfo', () => {
    beforeEach(() => vi.clearAllMocks())

    it('filters out readonly sets and the global "system" set; prefers scene-local default', () => {
        const { ctx, getStyleSetsJSON } = makeFixture({
            styleSetsJSON: {
                0: JSON.stringify([
                    // The global "system" set is always skipped per UXP.
                    { name: 'system', uid: 1, scene_id: 0, readonly: false },
                    // Readonly global set is skipped.
                    { name: 'preset', uid: 2, scene_id: 0, readonly: true },
                    // Writable global is kept.
                    { name: 'my-global', uid: 3, scene_id: 0, readonly: false },
                ]),
                7: JSON.stringify([
                    // Scene-local writable -- should be preselected.
                    { name: 'user', uid: 11, scene_id: 7, readonly: false },
                ]),
            },
        })
        const res = services.getCreateRendStyleInfo(ctx, { sceneId: 7, rendId: 100 })
        expect(res.ok).toBe(true)
        // Both scopes are queried.
        expect(getStyleSetsJSON).toHaveBeenCalledWith(0)
        expect(getStyleSetsJSON).toHaveBeenCalledWith(7)
        expect(res.styleSets.map((s) => s.uid)).toEqual([3, 11])
        // Scene-local entry (uid 11) is the default-selected.
        expect(res.defaultSelectedUid).toBe(11)
    })

    it('falls back to first entry when no scene-local writable set exists', () => {
        const { ctx } = makeFixture({
            styleSetsJSON: {
                0: JSON.stringify([
                    { name: 'my-global', uid: 3, scene_id: 0, readonly: false },
                ]),
            },
        })
        const res = services.getCreateRendStyleInfo(ctx, { sceneId: 7, rendId: 100 })
        expect(res.defaultSelectedUid).toBe(3)
    })

    it('returns defaultSelectedUid:-1 when no writable sets exist', () => {
        const { ctx } = makeFixture({
            styleSetsJSON: {
                0: JSON.stringify([
                    { name: 'system', uid: 1, scene_id: 0, readonly: false },
                    { name: 'preset', uid: 2, scene_id: 0, readonly: true },
                ]),
            },
        })
        const res = services.getCreateRendStyleInfo(ctx, { sceneId: 7, rendId: 100 })
        expect(res.styleSets).toEqual([])
        expect(res.defaultSelectedUid).toBe(-1)
    })

    it('surfaces renderer name + type_name for the dialog header', () => {
        const { ctx } = makeFixture({
            rendName: 'mol1.cart', typeName: 'cartoon',
        })
        const res = services.getCreateRendStyleInfo(ctx, { sceneId: 7, rendId: 100 })
        expect(res.rendName).toBe('mol1.cart')
        expect(res.rendTypeName).toBe('cartoon')
    })

    it('returns ok:false on scene / renderer / type_name lookup failure', () => {
        for (const o of [
            { sceneExists: false },
            { rendExists: false },
            { typeName: '' },
        ] as const) {
            const { ctx } = makeFixture(o)
            const res = services.getCreateRendStyleInfo(ctx, { sceneId: 7, rendId: 100 })
            expect(res.ok).toBe(false)
        }
    })
})

describe('createStyleFromRenderer', () => {
    beforeEach(() => vi.clearAllMocks())

    it('appends type_name to baseName and calls StyleManager.createStyleFromObj', () => {
        const { ctx, createStyleFromObj, rend } = makeFixture({
            typeName: 'cartoon',
        })
        const res = services.createStyleFromRenderer(ctx, {
            sceneId: 7, rendId: 100, setUid: 11, baseName: 'My',
        })
        expect(res).toEqual({ ok: true, styleName: 'Mycartoon' })
        expect(createStyleFromObj).toHaveBeenCalledWith(7, 11, 'Mycartoon', rend)
    })

    it('trims whitespace from baseName before appending', () => {
        const { ctx, createStyleFromObj } = makeFixture({ typeName: 'cartoon' })
        const res = services.createStyleFromRenderer(ctx, {
            sceneId: 7, rendId: 100, setUid: 11, baseName: '  Fancy ',
        })
        expect(res.styleName).toBe('Fancycartoon')
        expect(createStyleFromObj).toHaveBeenCalledWith(7, 11, 'Fancycartoon', expect.anything())
    })

    it('returns ok:false when baseName is empty / whitespace', () => {
        const { ctx, createStyleFromObj } = makeFixture()
        const res = services.createStyleFromRenderer(ctx, {
            sceneId: 7, rendId: 100, setUid: 11, baseName: '   ',
        })
        expect(res).toEqual({ ok: false, styleName: '' })
        expect(createStyleFromObj).not.toHaveBeenCalled()
    })

    it('catches C++ exceptions and returns ok:false', () => {
        const { ctx, createStyleFromObj } = makeFixture()
        createStyleFromObj.mockImplementation(() => { throw new Error('boom') })
        const res = services.createStyleFromRenderer(ctx, {
            sceneId: 7, rendId: 100, setUid: 11, baseName: 'X',
        })
        expect(res).toEqual({ ok: false, styleName: '' })
    })

    it('returns ok:false on scene / renderer / StyleManager lookup failure', () => {
        for (const o of [
            { sceneExists: false },
            { rendExists: false },
            { hasStyleMgr: false },
        ] as const) {
            const { ctx } = makeFixture(o)
            const res = services.createStyleFromRenderer(ctx, {
                sceneId: 7, rendId: 100, setUid: 11, baseName: 'X',
            })
            expect(res.ok).toBe(false)
        }
    })
})
