import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '../worker/server/services/rendererStyle.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

interface FixtureOpts {
    /** Initial renderer.style value. */
    initialStyle?: string
    /** renderer.type_name. */
    typeName?: string
    /** When false, scene lookup returns null. */
    sceneExists?: boolean
    /** When false, scene.getRenderer returns null. */
    rendExists?: boolean
    /** Mock JSON returned by styleMgr.getStyleNamesJSON keyed by sceneId. */
    styleNamesJSON?: Record<number, string>
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        initialStyle = 'DefaultCartoon,DefaultHSCPaint',
        typeName = 'cartoon',
        sceneExists = true,
        rendExists = true,
        styleNamesJSON = {},
    } = opts

    const applyStyles = vi.fn()
    let styleValue = initialStyle

    const rend = {
        get style() { return styleValue },
        set style(v: string) { styleValue = v },
        get type_name() { return typeName },
        applyStyles,
    }

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const scene = {
        uid: 7,
        getRenderer: vi.fn(() => (rendExists ? rend : null)),
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }

    const getStyleNamesJSON = vi.fn((id: number) => styleNamesJSON[id] ?? '[]')

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
        styleMgr: { getStyleNamesJSON },
    } as unknown as WorkerContext

    return {
        ctx, rend, scene, applyStyles, getStyleNamesJSON,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
        getStyle: () => styleValue,
    }
}

describe('getRendererStyleEntries', () => {
    beforeEach(() => vi.clearAllMocks())

    it('filters type styles by case-insensitive <type_name>$ and includes edges', () => {
        const { ctx } = makeFixture({
            typeName: 'cartoon',
            styleNamesJSON: {
                0: JSON.stringify([
                    { name: 'DefaultCartoon', desc: 'Default cartoon' },
                    { name: 'DefaultRibbon' },
                    { name: 'EgLineDefault', desc: 'Edge default' },
                    { name: 'EgLineThin' },
                ]),
                7: JSON.stringify([
                    { name: 'UserCartoon' },
                ]),
            },
        })
        const res = services.getRendererStyleEntries(ctx, { sceneId: 7, rendId: 100 })
        expect(res.ok).toBe(true)
        expect(res.typeStyles.map((e) => e.name)).toEqual([
            'DefaultCartoon', 'UserCartoon',
        ])
        expect(res.edgeStyles.map((e) => e.name)).toEqual([
            'EgLineDefault', 'EgLineThin',
        ])
        // Patterns are tagged so the worker can replay the regex on apply.
        expect(res.typeStyles[0]).toMatchObject({ pattern: 'cartoon$', flags: 'i' })
        expect(res.edgeStyles[0]).toMatchObject({ pattern: '^EgLine', flags: '' })
    })

    it('uses desc as label when present, falls back to name', () => {
        const { ctx } = makeFixture({
            typeName: 'cartoon',
            styleNamesJSON: {
                0: JSON.stringify([
                    { name: 'DefaultCartoon', desc: 'My cartoon' },
                    { name: 'PlainCartoon' },
                ]),
            },
        })
        const res = services.getRendererStyleEntries(ctx, { sceneId: 7, rendId: 100 })
        expect(res.typeStyles.map((e) => e.label)).toEqual([
            'My cartoon', 'PlainCartoon',
        ])
    })

    it('omits edge styles for blocklisted renderer types', () => {
        const { ctx } = makeFixture({
            typeName: 'simple',
            styleNamesJSON: {
                0: JSON.stringify([
                    { name: 'DefaultSimple' },
                    { name: 'EgLineDefault' },
                ]),
            },
        })
        const res = services.getRendererStyleEntries(ctx, { sceneId: 7, rendId: 100 })
        expect(res.typeStyles.map((e) => e.name)).toEqual(['DefaultSimple'])
        expect(res.edgeStyles).toEqual([])
    })

    it('escapes regex metachars in synthetic renderer type names like *selection', () => {
        const { ctx } = makeFixture({
            typeName: '*selection',
            styleNamesJSON: {
                0: JSON.stringify([
                    { name: 'Anyselection' },        // would match `selection$` if unescaped
                    { name: 'Default*selection' },   // literal match
                ]),
            },
        })
        const res = services.getRendererStyleEntries(ctx, { sceneId: 7, rendId: 100 })
        expect(res.typeStyles.map((e) => e.name)).toEqual(['Default*selection'])
    })

    it('returns ok:false when scene / renderer / type_name is missing', () => {
        for (const o of [
            { sceneExists: false },
            { rendExists: false },
            { typeName: '' },
        ] as const) {
            const { ctx } = makeFixture(o)
            const res = services.getRendererStyleEntries(ctx, { sceneId: 7, rendId: 100 })
            expect(res).toEqual({ ok: false, typeStyles: [], edgeStyles: [] })
        }
    })
})

describe('applyRendererStyle', () => {
    beforeEach(() => vi.clearAllMocks())

    it('strips entries matching pattern and pushes the new style under "Change style" txn', () => {
        const { ctx, applyStyles, startUndoTxn, commitUndoTxn } = makeFixture({
            initialStyle: 'DefaultCartoon,DefaultHSCPaint',
        })
        const res = services.applyRendererStyle(ctx, {
            sceneId: 7, rendId: 100,
            styleName: 'UserCartoon',
            pattern: 'cartoon$',
            flags: 'i',
        })
        expect(res).toEqual({ ok: true })
        // DefaultCartoon matches `cartoon$/i` and is removed; UserCartoon pushed last.
        expect(applyStyles).toHaveBeenCalledWith('DefaultHSCPaint,UserCartoon')
        expect(startUndoTxn).toHaveBeenCalledWith('Change style')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('edge style pattern leaves type styles intact and stacks the edge', () => {
        const { ctx, applyStyles } = makeFixture({
            initialStyle: 'DefaultCartoon,EgLineDefault',
        })
        services.applyRendererStyle(ctx, {
            sceneId: 7, rendId: 100,
            styleName: 'EgLineThin',
            pattern: '^EgLine',
            flags: '',
        })
        expect(applyStyles).toHaveBeenCalledWith('DefaultCartoon,EgLineThin')
    })

    it('returns ok:false when style name is empty', () => {
        const { ctx, applyStyles } = makeFixture()
        const res = services.applyRendererStyle(ctx, {
            sceneId: 7, rendId: 100, styleName: '', pattern: 'cartoon$', flags: 'i',
        })
        expect(res).toEqual({ ok: false })
        expect(applyStyles).not.toHaveBeenCalled()
    })

    it('returns ok:false on invalid regex (defensive)', () => {
        const { ctx, applyStyles } = makeFixture()
        const res = services.applyRendererStyle(ctx, {
            sceneId: 7, rendId: 100,
            styleName: 'UserCartoon',
            pattern: '[invalid(',
            flags: '',
        })
        expect(res).toEqual({ ok: false })
        expect(applyStyles).not.toHaveBeenCalled()
    })

    it('returns ok:false on scene / renderer lookup failure', () => {
        const a = makeFixture({ sceneExists: false })
        expect(services.applyRendererStyle(a.ctx, {
            sceneId: 7, rendId: 100, styleName: 'X', pattern: 'a$', flags: '',
        })).toEqual({ ok: false })

        const b = makeFixture({ rendExists: false })
        expect(services.applyRendererStyle(b.ctx, {
            sceneId: 7, rendId: 100, styleName: 'X', pattern: 'a$', flags: '',
        })).toEqual({ ok: false })
    })
})
