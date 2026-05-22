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

// ─────────────────────────────────────────────────────────────
// Phase 1 (Coloring panel) — new paint-type-* cases + listing,
// state fetch, Paint CRUD, default-color write.
// ─────────────────────────────────────────────────────────────

vi.mock('../worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn((_ctx: unknown, selStr: string, uid: number) => {
        if (!selStr) return null
        return { __sel: selStr, __uid: uid }
    }),
}))

vi.mock('../worker/server/services/helpers/makeColor', () => ({
    makeColor: vi.fn((_ctx: unknown, value: string, uid: number) => ({
        __color: value,
        __uid: uid,
    })),
}))

describe('setRendererColoring — Phase 1 new cases', () => {
    beforeEach(() => vi.clearAllMocks())

    it('paint-type-paint instantiates PaintColoring and assigns', () => {
        const { ctx, createObj, setColoring } = makeFixture()
        const res = services.setRendererColoring(ctx, baseArgs('paint-type-paint'))
        expect(res).toEqual({ ok: true })
        expect(createObj).toHaveBeenCalledWith('PaintColoring')
        expect(setColoring).toHaveBeenCalledWith({ __coloring: 'PaintColoring' })
    })

    it('paint-type-solid calls resetProp("coloring") without instantiating', () => {
        const { ctx, createObj, resetProp, setColoring } = makeFixture()
        const res = services.setRendererColoring(ctx, baseArgs('paint-type-solid'))
        expect(res).toEqual({ ok: true })
        expect(resetProp).toHaveBeenCalledWith('coloring')
        expect(createObj).not.toHaveBeenCalled()
        expect(setColoring).not.toHaveBeenCalled()
    })

    it('paint-type-resetdef also routes through resetProp("coloring")', () => {
        const { ctx, resetProp } = makeFixture()
        const res = services.setRendererColoring(ctx, baseArgs('paint-type-resetdef'))
        expect(res).toEqual({ ok: true })
        expect(resetProp).toHaveBeenCalledWith('coloring')
    })

    it('wraps the new paint-type-* cases in withUndoTxn', () => {
        const { ctx, startUndoTxn } = makeFixture()
        services.setRendererColoring(ctx, baseArgs('paint-type-paint'))
        expect(startUndoTxn).toHaveBeenCalledWith('Change coloring')

        const f2 = makeFixture()
        services.setRendererColoring(f2.ctx, baseArgs('paint-type-solid'))
        expect(f2.startUndoTxn).toHaveBeenCalledWith('Reset coloring')

        const f3 = makeFixture()
        services.setRendererColoring(f3.ctx, baseArgs('paint-type-resetdef'))
        expect(f3.startUndoTxn).toHaveBeenCalledWith('Reset coloring')
    })
})

// Helper to build a richer fixture: scene with getSceneDataJSON + per-renderer
// coloring objects. Used by listPaintCapableRenderers and getRendererColoringState.
interface PaintEntry { sel: string; color: string }
interface RendSpec {
    id: number
    name: string
    typeName: string
    coloringClass?: string | null
    defaultColor?: string
    paintEntries?: PaintEntry[]
}

interface ObjectSpec {
    id: number
    name: string
    /** When omitted, the object's `coloring` is undefined (filtered out). */
    coloringClass?: string | null
    defaultColor?: string
    paintEntries?: PaintEntry[]
    rends: RendSpec[]
}

interface MakeRichOpts {
    /** Top-level objects each with renderers. */
    objects: ObjectSpec[]
    sceneExists?: boolean
}

function makeRichFixture(opts: MakeRichOpts) {
    const { sceneExists = true } = opts

    const sceneDataJSON: unknown[] = [{ type: '', ID: 1, name: 'scene' }]
    const rendById = new Map<number, RendSpec>()
    for (const o of opts.objects) {
        sceneDataJSON.push({
            type: 'PDBMol',
            ID: o.id,
            name: o.name,
            rends: o.rends.map((r) => ({
                type: r.typeName,
                ID: r.id,
                name: r.name,
            })),
        })
        for (const r of o.rends) rendById.set(r.id, r)
    }

    const rendWrappers = new Map<number, ReturnType<typeof makeRendWrapper>>()
    const objWrappers = new Map<number, ReturnType<typeof makeRendWrapper>>()
    function makeRendWrapper(spec: RendSpec | ObjectSpec) {
        const setDefaultColor = vi.fn()
        const resetProp = vi.fn()
        const applyStyles = vi.fn()
        const setColoring = vi.fn()
        const hasPropDefault = vi.fn((_propName: string) => false)

        const paintEntries: PaintEntry[] = spec.paintEntries
            ? [...spec.paintEntries]
            : []

        const append = vi.fn((sel: unknown, col: unknown) => {
            const s = (sel as { __sel?: string })?.__sel ?? ''
            const c = (col as { __color?: string })?.__color ?? ''
            paintEntries.push({ sel: s, color: c })
        })
        const insertBefore = vi.fn(
            (idx: number, sel: unknown, col: unknown) => {
                const s = (sel as { __sel?: string })?.__sel ?? ''
                const c = (col as { __color?: string })?.__color ?? ''
                paintEntries.splice(idx, 0, { sel: s, color: c })
            },
        )
        const removeAt = vi.fn((idx: number) => {
            paintEntries.splice(idx, 1)
            return true
        })
        const changeAt = vi.fn((idx: number, sel: unknown, col: unknown) => {
            const s = (sel as { __sel?: string })?.__sel ?? ''
            const c = (col as { __color?: string })?.__color ?? ''
            paintEntries[idx] = { sel: s, color: c }
            return true
        })
        const getSelAt = vi.fn((idx: number) => ({
            __sel: paintEntries[idx]?.sel ?? '',
            toString: () => paintEntries[idx]?.sel ?? '',
        }))
        const getColorAt = vi.fn((idx: number) => ({
            __color: paintEntries[idx]?.color ?? '',
            toString: () => paintEntries[idx]?.color ?? '',
        }))

        const coloring =
            spec.coloringClass === null || spec.coloringClass === undefined
                ? undefined
                : {
                      getClassName: () => spec.coloringClass!,
                      get size() {
                          return paintEntries.length
                      },
                      append,
                      insertBefore,
                      removeAt,
                      changeAt,
                      getSelAt,
                      getColorAt,
                  }

        const typeName =
            (spec as RendSpec).typeName ?? (spec as ObjectSpec).name ?? ''
        const rend = {
            type_name: typeName,
            get coloring() {
                return coloring
            },
            set coloring(v: unknown) {
                setColoring(v)
            },
            get defaultcolor() {
                return spec.defaultColor !== undefined
                    ? { toString: () => spec.defaultColor! }
                    : undefined
            },
            set defaultcolor(v: unknown) {
                setDefaultColor(v)
            },
            resetProp,
            applyStyles,
            hasPropDefault,
        }

        return {
            rend,
            spies: {
                append, insertBefore, removeAt, changeAt,
                getSelAt, getColorAt, setDefaultColor, resetProp,
                setColoring, hasPropDefault,
            },
            getEntries: () => paintEntries,
        }
    }

    for (const o of opts.objects) {
        objWrappers.set(o.id, makeRendWrapper(o))
        for (const r of o.rends) rendWrappers.set(r.id, makeRendWrapper(r))
    }

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const scene = {
        uid: 7,
        getRenderer: vi.fn((id: number) => rendWrappers.get(id)?.rend ?? null),
        getObject: vi.fn((id: number) => objWrappers.get(id)?.rend ?? null),
        getSceneDataJSON: vi.fn(() => JSON.stringify(sceneDataJSON)),
        startUndoTxn,
        commitUndoTxn,
        rollbackUndoTxn,
    }

    const createObj = vi.fn((cls: string) => ({ __coloring: cls }))

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
        svc: { createObj },
        styleMgr: { getStyleNamesJSON: vi.fn(() => '[]') },
    } as unknown as WorkerContext

    return { ctx, scene, rendWrappers, startUndoTxn, commitUndoTxn }
}

describe('listPaintCapableRenderers', () => {
    beforeEach(() => vi.clearAllMocks())

    it('lists objects with a coloring property + their paint-capable child renderers', () => {
        const { ctx } = makeRichFixture({
            objects: [
                {
                    id: 10,
                    name: 'mol1',
                    coloringClass: 'PaintColoring', // object has its own coloring
                    rends: [
                        { id: 100, name: 'r1', typeName: 'cartoon', coloringClass: 'PaintColoring' },
                        // No coloring property -- skipped (gate fails).
                        { id: 101, name: 'r2', typeName: '*group', coloringClass: null },
                    ],
                },
                {
                    id: 20,
                    name: 'mol2',
                    // No object-level coloring -- object row skipped.
                    coloringClass: null,
                    rends: [
                        { id: 200, name: 'rx', typeName: 'simple', coloringClass: '' },
                    ],
                },
            ],
        })
        const res = services.listPaintCapableRenderers(ctx, { sceneId: 1 })
        expect(res.ok).toBe(true)
        // mol1 has both an object row and r1; mol2 only has rx.
        expect(res.renderers).toHaveLength(3)
        expect(res.renderers[0]).toMatchObject({
            targetKind: 'object', rendId: 10, name: 'mol1', objId: 10,
        })
        expect(res.renderers[1]).toMatchObject({
            targetKind: 'renderer', rendId: 100, name: 'r1', typeName: 'cartoon',
            objId: 10, objName: 'mol1',
        })
        expect(res.renderers[2]).toMatchObject({
            targetKind: 'renderer', rendId: 200, name: 'rx', typeName: 'simple',
            objId: 20, objName: 'mol2',
        })
    })

    it('returns ok:false when scene lookup fails', () => {
        const { ctx } = makeRichFixture({ objects: [], sceneExists: false })
        expect(services.listPaintCapableRenderers(ctx, { sceneId: 99 }))
            .toEqual({ ok: false, renderers: [] })
    })

    it('excludes the "*selection" renderer (UXP paint_coloring_filter)', () => {
        const { ctx } = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', coloringClass: null, rends: [
                    { id: 100, name: 'r1', typeName: 'cartoon', coloringClass: 'PaintColoring' },
                    // The selection-display renderer must NOT appear in the
                    // panel selector even though it carries a `coloring`
                    // property under the hood.
                    { id: 101, name: 'sel', typeName: '*selection', coloringClass: 'PaintColoring' },
                    { id: 102, name: 'r2', typeName: 'simple', coloringClass: '' },
                ],
            }],
        })
        const res = services.listPaintCapableRenderers(ctx, { sceneId: 1 })
        expect(res.ok).toBe(true)
        const names = res.renderers.map((r) => r.name)
        expect(names).toContain('r1')
        expect(names).toContain('r2')
        expect(names).not.toContain('sel')
    })
})

describe('getRendererColoringState', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns PaintColoring entries when class is PaintColoring', () => {
        const { ctx } = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'cartoon',
                    coloringClass: 'PaintColoring',
                    paintEntries: [
                        { sel: 'sheet', color: '#FF0000' },
                        { sel: 'helix', color: '#0000FF' },
                    ],
                    defaultColor: '#888888',
                }],
            }],
        })
        const res = services.getRendererColoringState(ctx, { sceneId: 1, rendId: 100 })
        expect(res.ok).toBe(true)
        expect(res.className).toBe('PaintColoring')
        expect(res.defaultColor).toBe('#888888')
        expect(res.paintEntries).toEqual([
            { idx: 0, selStr: 'sheet', colorValue: '#FF0000' },
            { idx: 1, selStr: 'helix', colorValue: '#0000FF' },
        ])
    })

    it('returns className "" and empty paintEntries when coloring is null', () => {
        const { ctx } = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'simple',
                    coloringClass: null,
                    defaultColor: '#123456',
                }],
            }],
        })
        const res = services.getRendererColoringState(ctx, { sceneId: 1, rendId: 100 })
        expect(res.ok).toBe(true)
        expect(res.className).toBe('')
        expect(res.defaultColor).toBe('#123456')
        expect(res.paintEntries).toEqual([])
    })

    it('does not read paint entries for non-PaintColoring classes', () => {
        const { ctx, rendWrappers } = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'cartoon',
                    coloringClass: 'CPKColoring',
                    defaultColor: '#000000',
                }],
            }],
        })
        const res = services.getRendererColoringState(ctx, { sceneId: 1, rendId: 100 })
        expect(res.className).toBe('CPKColoring')
        expect(res.paintEntries).toEqual([])
        expect(rendWrappers.get(100)!.spies.getSelAt).not.toHaveBeenCalled()
    })
})

describe('Paint entry CRUD', () => {
    beforeEach(() => vi.clearAllMocks())

    function paintFixture() {
        return makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'cartoon',
                    coloringClass: 'PaintColoring',
                    paintEntries: [
                        { sel: 'A', color: '#FF0000' },
                        { sel: 'B', color: '#00FF00' },
                        { sel: 'C', color: '#0000FF' },
                    ],
                }],
            }],
        })
    }

    it('addPaintEntry uses append when idx === size', () => {
        const { ctx, rendWrappers, startUndoTxn } = paintFixture()
        const res = services.addPaintEntry(ctx, {
            sceneId: 1, rendId: 100, idx: 3, selStr: 'X', colorValue: '#ABCDEF',
        })
        expect(res).toEqual({ ok: true })
        expect(rendWrappers.get(100)!.spies.append).toHaveBeenCalled()
        expect(rendWrappers.get(100)!.spies.insertBefore).not.toHaveBeenCalled()
        expect(startUndoTxn).toHaveBeenCalledWith('Add paint entry')
    })

    it('addPaintEntry uses insertBefore for mid-list inserts', () => {
        const { ctx, rendWrappers } = paintFixture()
        services.addPaintEntry(ctx, {
            sceneId: 1, rendId: 100, idx: 1, selStr: 'X', colorValue: '#ABCDEF',
        })
        expect(rendWrappers.get(100)!.spies.insertBefore).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ __sel: 'X' }),
            expect.objectContaining({ __color: '#ABCDEF' }),
        )
    })

    it('addPaintEntry rejects when selection compile fails (empty selStr)', () => {
        const { ctx, rendWrappers } = paintFixture()
        const res = services.addPaintEntry(ctx, {
            sceneId: 1, rendId: 100, idx: 0, selStr: '', colorValue: '#FFF',
        })
        expect(res).toEqual({ ok: false })
        expect(rendWrappers.get(100)!.spies.append).not.toHaveBeenCalled()
    })

    it('removePaintEntry calls removeAt and wraps in undo', () => {
        const { ctx, rendWrappers, startUndoTxn } = paintFixture()
        const res = services.removePaintEntry(ctx, { sceneId: 1, rendId: 100, idx: 1 })
        expect(res).toEqual({ ok: true })
        expect(rendWrappers.get(100)!.spies.removeAt).toHaveBeenCalledWith(1)
        expect(startUndoTxn).toHaveBeenCalledWith('Delete paint entry')
    })

    it('updatePaintEntry calls changeAt with compiled sel + color', () => {
        const { ctx, rendWrappers } = paintFixture()
        services.updatePaintEntry(ctx, {
            sceneId: 1, rendId: 100, idx: 2, selStr: 'Z', colorValue: 'red',
        })
        expect(rendWrappers.get(100)!.spies.changeAt).toHaveBeenCalledWith(
            2,
            expect.objectContaining({ __sel: 'Z' }),
            expect.objectContaining({ __color: 'red' }),
        )
    })

    it('movePaintEntry remove-then-insert (move down)', () => {
        const { ctx, rendWrappers } = paintFixture()
        const res = services.movePaintEntry(ctx, {
            sceneId: 1, rendId: 100, fromIdx: 0, toIdx: 2,
        })
        expect(res).toEqual({ ok: true })
        // After remove of idx=0, list is [B,C]; insertBefore(2) appends X at end.
        // Our fixture preserves entries; verify the final order via the
        // internal entries snapshot.
        expect(rendWrappers.get(100)!.getEntries()).toEqual([
            { sel: 'B', color: '#00FF00' },
            { sel: 'C', color: '#0000FF' },
            { sel: 'A', color: '#FF0000' },
        ])
    })

    it('movePaintEntry remove-then-insert (move up)', () => {
        const { ctx, rendWrappers } = paintFixture()
        services.movePaintEntry(ctx, {
            sceneId: 1, rendId: 100, fromIdx: 2, toIdx: 0,
        })
        expect(rendWrappers.get(100)!.getEntries()).toEqual([
            { sel: 'C', color: '#0000FF' },
            { sel: 'A', color: '#FF0000' },
            { sel: 'B', color: '#00FF00' },
        ])
    })

    it('movePaintEntry rejects out-of-range fromIdx', () => {
        const { ctx } = paintFixture()
        const res = services.movePaintEntry(ctx, {
            sceneId: 1, rendId: 100, fromIdx: 99, toIdx: 0,
        })
        expect(res).toEqual({ ok: false })
    })

    it('materializes default coloring before mutating (UXP isPropDefault guard)', () => {
        const f = paintFixture()
        // Mark the coloring as default-inherited so the guard fires.
        f.rendWrappers.get(100)!.spies.hasPropDefault.mockReturnValue(true)
        services.movePaintEntry(f.ctx, {
            sceneId: 1, rendId: 100, fromIdx: 0, toIdx: 2,
        })
        expect(f.rendWrappers.get(100)!.spies.hasPropDefault)
            .toHaveBeenCalledWith('coloring')
        // The reassignment `rend.coloring = coloring` must fire to materialize
        // a per-renderer instance before the move mutations.
        expect(f.rendWrappers.get(100)!.spies.setColoring).toHaveBeenCalled()
    })

    it('skips materialize when coloring is already non-default', () => {
        const f = paintFixture()
        f.rendWrappers.get(100)!.spies.hasPropDefault.mockReturnValue(false)
        services.movePaintEntry(f.ctx, {
            sceneId: 1, rendId: 100, fromIdx: 0, toIdx: 1,
        })
        expect(f.rendWrappers.get(100)!.spies.setColoring).not.toHaveBeenCalled()
    })

    it('paint CRUD short-circuits when coloring is not PaintColoring', () => {
        const { ctx, rendWrappers } = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'cartoon',
                    coloringClass: 'CPKColoring',
                }],
            }],
        })
        expect(services.addPaintEntry(ctx, {
            sceneId: 1, rendId: 100, idx: 0, selStr: 'A', colorValue: '#FFF',
        })).toEqual({ ok: false })
        expect(services.removePaintEntry(ctx, {
            sceneId: 1, rendId: 100, idx: 0,
        })).toEqual({ ok: false })
        expect(rendWrappers.get(100)!.spies.append).not.toHaveBeenCalled()
    })
})

describe('setRendererDefaultColor', () => {
    beforeEach(() => vi.clearAllMocks())

    it('writes compiled color into rend.defaultcolor under undo', () => {
        const { ctx, rendWrappers, startUndoTxn } = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'simple',
                    coloringClass: null, defaultColor: '#000000',
                }],
            }],
        })
        const res = services.setRendererDefaultColor(ctx, {
            sceneId: 1, rendId: 100, colorValue: '#FF00FF',
        })
        expect(res).toEqual({ ok: true })
        expect(rendWrappers.get(100)!.spies.setDefaultColor).toHaveBeenCalledWith(
            expect.objectContaining({ __color: '#FF00FF' }),
        )
        expect(startUndoTxn).toHaveBeenCalledWith('Change default color')
    })
})

// ─────────────────────────────────────────────────────────────
// Object-level coloring (targetKind: 'object')
// ─────────────────────────────────────────────────────────────

describe('targetKind: "object" routes to scene.getObject', () => {
    beforeEach(() => vi.clearAllMocks())

    function objFixture() {
        const f = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1',
                coloringClass: 'PaintColoring',
                paintEntries: [{ sel: 'A', color: '#FF0000' }],
                defaultColor: '#888888',
                rends: [],
            }],
        })
        return f
    }

    it('getRendererColoringState resolves via scene.getObject', () => {
        const f = objFixture()
        const res = services.getRendererColoringState(f.ctx, {
            sceneId: 1, rendId: 10, targetKind: 'object',
        })
        expect(f.scene.getObject).toHaveBeenCalledWith(10)
        expect(res.ok).toBe(true)
        expect(res.className).toBe('PaintColoring')
        expect(res.paintEntries).toEqual([
            { idx: 0, selStr: 'A', colorValue: '#FF0000' },
        ])
    })

    it('addPaintEntry on object-level PaintColoring', () => {
        const f = objFixture()
        const res = services.addPaintEntry(f.ctx, {
            sceneId: 1, rendId: 10, targetKind: 'object',
            idx: 1, selStr: 'B', colorValue: '#00FF00',
        })
        expect(res).toEqual({ ok: true })
        expect(f.scene.getObject).toHaveBeenCalledWith(10)
    })

    it('setRendererDefaultColor on object', () => {
        const f = objFixture()
        const res = services.setRendererDefaultColor(f.ctx, {
            sceneId: 1, rendId: 10, targetKind: 'object',
            colorValue: '#ABCDEF',
        })
        expect(res).toEqual({ ok: true })
        expect(f.scene.getObject).toHaveBeenCalledWith(10)
    })

    it('setRendererColoring "paint-type-paint" on object', () => {
        const f = objFixture()
        const res = services.setRendererColoring(f.ctx, {
            sceneId: 1, rendId: 10, targetKind: 'object',
            coloringId: 'paint-type-paint',
        })
        expect(res).toEqual({ ok: true })
        expect(f.scene.getObject).toHaveBeenCalledWith(10)
    })

    it('setRendererColoring rejects style-* on object (no applyStyles)', () => {
        const f = objFixture()
        const res = services.setRendererColoring(f.ctx, {
            sceneId: 1, rendId: 10, targetKind: 'object',
            coloringId: 'style-DefaultCPKColoring',
        })
        expect(res).toEqual({ ok: false })
    })
})
