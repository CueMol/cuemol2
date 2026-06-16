import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '../worker/server/services/rendererStyle.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

interface FixtureOpts {
    /** Initial renderer.style value. */
    initialStyle?: string
    /** renderer.type_name. */
    typeName?: string
    /** renderer.name. */
    rendName?: string
    /** When false, scene lookup returns null. */
    sceneExists?: boolean
    /** When false, scene.getRenderer returns null. */
    rendExists?: boolean
    /** Mock JSON returned by styleMgr.getStyleNamesJSON keyed by sceneId. */
    styleNamesJSON?: Record<number, string>
    /** When false, drop `coloring` from rend (suppresses Coloring section). */
    hasColoring?: boolean
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        initialStyle = 'DefaultCartoon,DefaultHSCPaint',
        typeName = 'cartoon',
        rendName = 'rend1',
        sceneExists = true,
        rendExists = true,
        styleNamesJSON = {},
        hasColoring = true,
    } = opts

    const applyStyles = vi.fn()
    let styleValue = initialStyle

    const rendBase: Record<string, unknown> = {
        get style() { return styleValue },
        set style(v: string) { styleValue = v },
        get type_name() { return typeName },
        get name() { return rendName },
        applyStyles,
    }
    if (hasColoring) rendBase.coloring = {}
    const rend = rendBase

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


// --- Phase 6c -- getRendererStyleEditInfo + applyRendererStyleList ---

describe("getRendererStyleEditInfo", () => {
    beforeEach(() => vi.clearAllMocks())

    it("parses current styles, groups available styles, and excludes already-applied names", () => {
        const { ctx } = makeFixture({
            initialStyle: "DefaultCartoon EgLineDefault",
            typeName: "cartoon",
            styleNamesJSON: {
                0: JSON.stringify([
                    { name: "DefaultCartoon", desc: "Default cartoon" },
                    { name: "DefaultRibbonCartoon", desc: "Ribbon" },
                    { name: "EgLineDefault" },
                    { name: "EgLineThin", desc: "Thin edge" },
                    { name: "RibbonColoring", desc: "Ribbon coloring" },
                    { name: "DefaultPaint" },
                ]),
            },
        })
        const res = services.getRendererStyleEditInfo(ctx, { sceneId: 7, rendId: 100 })
        expect(res.ok).toBe(true)
        expect(res.rendTypeName).toBe("cartoon")
        expect(res.currentStyles).toEqual(["DefaultCartoon", "EgLineDefault"])
        // typeMatch excludes already-applied DefaultCartoon
        expect(res.typeMatch.map((e) => e.name)).toEqual(["DefaultRibbonCartoon"])
        // edgeMatch excludes already-applied EgLineDefault
        expect(res.edgeMatch.map((e) => e.name)).toEqual(["EgLineThin"])
        expect(res.coloringMatch.map((e) => e.name)).toEqual([
            "RibbonColoring", "DefaultPaint",
        ])
        // label uses "name (desc)" when desc present
        expect(res.typeMatch[0].label).toBe("DefaultRibbonCartoon (Ribbon)")
    })

    it("omits the Coloring section when renderer has no coloring property", () => {
        const { ctx } = makeFixture({
            hasColoring: false,
            styleNamesJSON: {
                0: JSON.stringify([{ name: "DefaultPaint" }, { name: "DefaultCartoon" }]),
            },
        })
        const res = services.getRendererStyleEditInfo(ctx, { sceneId: 7, rendId: 100 })
        expect(res.coloringMatch).toEqual([])
    })

    it("omits the edge section for blocklisted renderer types", () => {
        const { ctx } = makeFixture({
            typeName: "simple",
            initialStyle: "",
            styleNamesJSON: {
                0: JSON.stringify([{ name: "EgLineDefault" }, { name: "DefaultSimple" }]),
            },
        })
        const res = services.getRendererStyleEditInfo(ctx, { sceneId: 7, rendId: 100 })
        expect(res.edgeMatch).toEqual([])
        expect(res.typeMatch.map((e) => e.name)).toEqual(["DefaultSimple"])
    })

    it("returns ok:false on scene / renderer lookup failure", () => {
        for (const o of [{ sceneExists: false }, { rendExists: false }] as const) {
            const { ctx } = makeFixture(o)
            expect(services.getRendererStyleEditInfo(ctx, { sceneId: 7, rendId: 100 }).ok).toBe(false)
        }
    })

    it("handles empty rend.style without breaking", () => {
        const { ctx } = makeFixture({
            initialStyle: "",
            styleNamesJSON: {
                0: JSON.stringify([{ name: "DefaultCartoon" }]),
            },
        })
        const res = services.getRendererStyleEditInfo(ctx, { sceneId: 7, rendId: 100 })
        expect(res.currentStyles).toEqual([])
        expect(res.typeMatch.map((e) => e.name)).toEqual(["DefaultCartoon"])
    })
})

describe("applyRendererStyleList", () => {
    beforeEach(() => vi.clearAllMocks())

    it("joins the list with commas and applies under \"Change style\" undo txn", () => {
        const { ctx, applyStyles, startUndoTxn, commitUndoTxn } = makeFixture()
        const res = services.applyRendererStyleList(ctx, {
            sceneId: 7, rendId: 100,
            styleNames: ["A", "B", "C"],
        })
        expect(res).toEqual({ ok: true })
        expect(applyStyles).toHaveBeenCalledWith("A,B,C")
        expect(startUndoTxn).toHaveBeenCalledWith("Change style")
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it("filters whitespace / empty entries from the input list", () => {
        const { ctx, applyStyles } = makeFixture()
        services.applyRendererStyleList(ctx, {
            sceneId: 7, rendId: 100,
            styleNames: ["A", "  ", "", "B"],
        })
        expect(applyStyles).toHaveBeenCalledWith("A,B")
    })

    it("empty list applies an empty style string (clears all)", () => {
        const { ctx, applyStyles } = makeFixture()
        services.applyRendererStyleList(ctx, {
            sceneId: 7, rendId: 100, styleNames: [],
        })
        expect(applyStyles).toHaveBeenCalledWith("")
    })

    it("returns ok:false when scene / renderer lookup fails", () => {
        const a = makeFixture({ sceneExists: false })
        expect(services.applyRendererStyleList(a.ctx, {
            sceneId: 7, rendId: 100, styleNames: ["A"],
        })).toEqual({ ok: false })

        const b = makeFixture({ rendExists: false })
        expect(services.applyRendererStyleList(b.ctx, {
            sceneId: 7, rendId: 100, styleNames: ["A"],
        })).toEqual({ ok: false })
    })
})
