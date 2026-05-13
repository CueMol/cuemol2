import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '../worker/server/services/rendererColoring.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import type { RendColoringId } from '../../shared/ipcTypes'

interface MakeFixtureOpts {
    /** Initial renderer.style value (UXP-style comma-separated). */
    initialStyle?: string
    /** Initial type_name; "molsurf" triggers the colormode side-effect. */
    typeName?: string
    /** If false, ctx.sceMgr.getScene returns null. */
    sceneExists?: boolean
    /** If false, scene.getRenderer returns null. */
    rendExists?: boolean
    /** Mock JSON returned by styleMgr.getStyleNamesJSON, keyed by sceneId. */
    styleNamesJSON?: Record<number, string>
}

function makeFixture(opts: MakeFixtureOpts = {}) {
    const {
        initialStyle = 'DefaultCartoon,DefaultHSCPaint',
        typeName = 'cartoon',
        sceneExists = true,
        rendExists = true,
    } = opts

    const applyStyles = vi.fn()
    const resetProp = vi.fn()
    const setColoring = vi.fn()
    const setColormode = vi.fn()

    let styleValue = initialStyle
    let colormodeValue = ''

    const rend = {
        // Plain accessors so the service can read/write style and properties.
        get style() { return styleValue },
        set style(v: string) { styleValue = v },
        get type_name() { return typeName },
        get colormode() { return colormodeValue },
        set colormode(v: string) { colormodeValue = v; setColormode(v) },
        set coloring(v: unknown) { setColoring(v) },
        get coloring() { return undefined },
        applyStyles,
        resetProp,
    }

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const scene = {
        uid: 7,
        getRenderer: vi.fn(() => (rendExists ? rend : null)),
        startUndoTxn,
        commitUndoTxn,
        rollbackUndoTxn,
    }

    const createObj = vi.fn((cls: string) => ({ __coloring: cls }))

    const styleNamesJSON = opts.styleNamesJSON ?? {}
    const getStyleNamesJSON = vi.fn((id: number) => styleNamesJSON[id] ?? '[]')

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
        svc: { createObj },
        styleMgr: { getStyleNamesJSON },
    } as unknown as WorkerContext

    return {
        ctx, scene, rend, applyStyles, resetProp, setColoring, setColormode,
        createObj, getStyleNamesJSON, startUndoTxn, commitUndoTxn, rollbackUndoTxn,
        getStyle: () => styleValue,
    }
}

const baseArgs = (coloringId: RendColoringId) => ({
    sceneId: 1,
    rendId: 100,
    coloringId,
})

describe('setRendererColoring — style-* path', () => {
    beforeEach(() => vi.clearAllMocks())

    it('CPK molcol strips */Paint$/ then pushes DefaultCPKColoring + applyStyles', () => {
        const { ctx, applyStyles, resetProp } = makeFixture({
            initialStyle: 'DefaultCartoon,DefaultHSCPaint',
        })
        const res = services.setRendererColoring(ctx, baseArgs('style-DefaultCPKColoring'))
        expect(res).toEqual({ ok: true })
        // DefaultHSCPaint matches /Paint$/, gets stripped before push.
        expect(applyStyles).toHaveBeenCalledWith('DefaultCartoon,DefaultCPKColoring')
        expect(resetProp).toHaveBeenCalledWith('coloring')
    })

    it('CPK dark gray pushes DarkCPKColoring', () => {
        const { ctx, applyStyles } = makeFixture({ initialStyle: 'DefaultCartoon' })
        services.setRendererColoring(ctx, baseArgs('style-DarkCPKColoring'))
        expect(applyStyles).toHaveBeenCalledWith('DefaultCartoon,DarkCPKColoring')
    })

    it('CPK light gray pushes LightCPKColoring', () => {
        const { ctx, applyStyles } = makeFixture({ initialStyle: 'DefaultCartoon' })
        services.setRendererColoring(ctx, baseArgs('style-LightCPKColoring'))
        expect(applyStyles).toHaveBeenCalledWith('DefaultCartoon,LightCPKColoring')
    })

    it('molsurf forces colormode = "molecule" before applyStyles', () => {
        const { ctx, setColormode, applyStyles } = makeFixture({
            initialStyle: '',
            typeName: 'molsurf',
        })
        services.setRendererColoring(ctx, baseArgs('style-DefaultCPKColoring'))
        expect(setColormode).toHaveBeenCalledWith('molecule')
        expect(applyStyles).toHaveBeenCalled()
    })

    it('wraps style-* mutations in withUndoTxn ("Change coloring style")', () => {
        const { ctx, startUndoTxn, commitUndoTxn } = makeFixture()
        services.setRendererColoring(ctx, baseArgs('style-DefaultCPKColoring'))
        expect(startUndoTxn).toHaveBeenCalledWith('Change coloring style')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })
})

describe('setRendererColoring — paint-type-* path', () => {
    beforeEach(() => vi.clearAllMocks())

    it('paint-type-bfac creates BfacColoring and assigns to rend.coloring', () => {
        const { ctx, createObj, setColoring, applyStyles } = makeFixture()
        const res = services.setRendererColoring(ctx, baseArgs('paint-type-bfac'))
        expect(res).toEqual({ ok: true })
        expect(createObj).toHaveBeenCalledWith('BfacColoring')
        expect(setColoring).toHaveBeenCalledWith({ __coloring: 'BfacColoring' })
        expect(applyStyles).not.toHaveBeenCalled()
    })

    it('paint-type-rainbow creates RainbowColoring', () => {
        const { ctx, createObj, setColoring } = makeFixture()
        services.setRendererColoring(ctx, baseArgs('paint-type-rainbow'))
        expect(createObj).toHaveBeenCalledWith('RainbowColoring')
        expect(setColoring).toHaveBeenCalledWith({ __coloring: 'RainbowColoring' })
    })

    it('wraps paint-type-* mutations in withUndoTxn ("Change coloring")', () => {
        const { ctx, startUndoTxn, commitUndoTxn } = makeFixture()
        services.setRendererColoring(ctx, baseArgs('paint-type-bfac'))
        expect(startUndoTxn).toHaveBeenCalledWith('Change coloring')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })
})

describe('setRendererColoring — dynamic style-* (Phase 3c-2 path)', () => {
    beforeEach(() => vi.clearAllMocks())

    it('arbitrary style name flows through the same applyStyles path', () => {
        const { ctx, applyStyles, resetProp } = makeFixture({
            initialStyle: 'DefaultRibbon,DefaultHSCPaint',
        })
        // Mirrors a Paint(SS) entry returned by getPaintColoringStyles.
        const res = services.setRendererColoring(ctx, {
            sceneId: 1,
            rendId: 100,
            coloringId: 'style-CustomHelixPaint',
        })
        expect(res).toEqual({ ok: true })
        expect(applyStyles).toHaveBeenCalledWith('DefaultRibbon,CustomHelixPaint')
        expect(resetProp).toHaveBeenCalledWith('coloring')
    })

    it('empty style suffix rejects (defensive)', () => {
        const { ctx, applyStyles } = makeFixture()
        const res = services.setRendererColoring(ctx, {
            sceneId: 1,
            rendId: 100,
            coloringId: 'style-' as `style-${string}`,
        })
        expect(res).toEqual({ ok: false })
        expect(applyStyles).not.toHaveBeenCalled()
    })
})

describe('getPaintColoringStyles', () => {
    beforeEach(() => vi.clearAllMocks())

    it('filters merged global + scene entries by /Paint$/', () => {
        const { ctx } = makeFixture({
            styleNamesJSON: {
                0: JSON.stringify([
                    { name: 'DefaultHSCPaint', desc: 'HSC paint' },
                    { name: 'DefaultRibbon', desc: 'Ribbon' },
                ]),
                7: JSON.stringify([
                    { name: 'UserCustomPaint', desc: '' },
                    { name: 'SomeStyle', desc: 'should be dropped' },
                ]),
            },
        })
        const res = services.getPaintColoringStyles(ctx, { sceneId: 7 })
        expect(res.ok).toBe(true)
        expect(res.entries.map((e) => e.name)).toEqual([
            'DefaultHSCPaint',
            'UserCustomPaint',
        ])
    })

    it('uses desc as label when present, falls back to name', () => {
        const { ctx } = makeFixture({
            styleNamesJSON: {
                0: JSON.stringify([
                    { name: 'AlphaPaint', desc: 'Alpha label' },
                    { name: 'BetaPaint', desc: '' },
                ]),
            },
        })
        const res = services.getPaintColoringStyles(ctx, { sceneId: 7 })
        expect(res.entries).toEqual([
            { name: 'AlphaPaint', label: 'Alpha label' },
            { name: 'BetaPaint', label: 'BetaPaint' },
        ])
    })

    it('queries global (id=0) and scene-local entries', () => {
        const { ctx, getStyleNamesJSON } = makeFixture({
            styleNamesJSON: { 0: '[]', 7: '[]' },
        })
        services.getPaintColoringStyles(ctx, { sceneId: 7 })
        expect(getStyleNamesJSON).toHaveBeenCalledWith(0)
        expect(getStyleNamesJSON).toHaveBeenCalledWith(7)
    })

    it('returns ok:true with empty entries on malformed JSON', () => {
        const { ctx } = makeFixture({
            styleNamesJSON: { 0: 'not-json', 7: '[]' },
        })
        const res = services.getPaintColoringStyles(ctx, { sceneId: 7 })
        expect(res).toEqual({ ok: true, entries: [] })
    })
})

describe('setRendererColoring — failure modes', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns ok:false when scene lookup fails', () => {
        const { ctx, applyStyles, setColoring } = makeFixture({ sceneExists: false })
        const res = services.setRendererColoring(ctx, baseArgs('style-DefaultCPKColoring'))
        expect(res).toEqual({ ok: false })
        expect(applyStyles).not.toHaveBeenCalled()
        expect(setColoring).not.toHaveBeenCalled()
    })

    it('returns ok:false when renderer lookup fails', () => {
        const { ctx, applyStyles, setColoring } = makeFixture({ rendExists: false })
        const res = services.setRendererColoring(ctx, baseArgs('paint-type-rainbow'))
        expect(res).toEqual({ ok: false })
        expect(applyStyles).not.toHaveBeenCalled()
        expect(setColoring).not.toHaveBeenCalled()
    })
})
