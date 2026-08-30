import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '@renderer/worker/server/services/rendererColoring.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { RendColoringId } from '@shared/types/sceneCtxMenu'

/**
 * `colormode` enum values per renderer type, as the C++ wrappers report them.
 * Captured from the running addon alongside the inspector property fixtures
 * (`components/inspector/__fixtures__/rendererProps.json`).
 *
 * The service asks the renderer which modes it has rather than keeping its own
 * list, so the fixture has to answer that question the way the addon does.
 */
const COLORMODE_ENUMDEF: Record<string, string[]> = {
    molsurf: ['molecule', 'multigrad', 'potential', 'solid'],
    isosurf: ['molecule', 'multigrad', 'solid'],
    contour: ['molecule', 'multigrad', 'solid'],
    dsurface: ['molecule', 'potential'],
    dsurf2: ['molecule', 'potential'],
}

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
    /**
     * When set, the renderer exposes a `target` property (MOLFANC reference
     * mol) with this initial value; when omitted, reads yield undefined
     * (renderer without the property).
     */
    initialTarget?: string
    /** Top-level scene objects returned by scene.getSceneDataJSON. */
    sceneObjects?: Array<{ type: string; name: string }>
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
    const setTarget = vi.fn()

    let styleValue = initialStyle
    let colormodeValue = ''
    let targetValue = opts.initialTarget ?? ''

    const setProp = vi.fn((name: string, value: unknown) => {
        if (name === 'target') { targetValue = String(value); setTarget(value) }
    })

    const rend: Record<string, unknown> = {
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
        setProp,
        // How the service learns which colormodes this renderer accepts.
        getPropsJSON: () =>
            JSON.stringify(
                COLORMODE_ENUMDEF[typeName]
                    ? [{ name: 'colormode', type: 'enum', value: colormodeValue,
                         enumdef: COLORMODE_ENUMDEF[typeName] }]
                    : [],
            ),
    }
    if (opts.initialTarget !== undefined) {
        Object.defineProperty(rend, 'target', {
            get: () => targetValue,
            set: (v: string) => { targetValue = v; setTarget(v) },
        })
    }

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const scene = {
        uid: 7,
        getRenderer: vi.fn(() => (rendExists ? rend : null)),
        getSceneDataJSON: vi.fn(() => JSON.stringify([
            { type: '', ID: 1, name: 'scene' },
            ...(opts.sceneObjects ?? []).map((o, i) => ({
                type: o.type, ID: 10 + i, name: o.name,
            })),
        ])),
        startUndoTxn,
        commitUndoTxn,
        rollbackUndoTxn,
    }

    // `PaintColoring` gets an `append` seam so the default-painting rows the
    // Default entry seeds are observable (see `createDefPaintColoring`).
    const appendPaint = vi.fn()
    const createObj = vi.fn((cls: string) =>
        cls === 'PaintColoring'
            ? { __coloring: cls, append: appendPaint }
            : { __coloring: cls },
    )

    const styleNamesJSON = opts.styleNamesJSON ?? {}
    const getStyleNamesJSON = vi.fn((id: number) => styleNamesJSON[id] ?? '[]')

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
        svc: { createObj },
        styleMgr: { getStyleNamesJSON },
    } as unknown as WorkerContext

    return {
        ctx, scene, rend, applyStyles, resetProp, setColoring, setColormode,
        setTarget, setProp,
        createObj, appendPaint, getStyleNamesJSON, startUndoTxn, commitUndoTxn,
        rollbackUndoTxn,
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

// -------------------------------------------------------------
// Coloring panel -- paint-type-* cases + listing,
// state fetch, Paint CRUD, default-color write.
// -------------------------------------------------------------

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn((_ctx: unknown, selStr: string, uid: number) => {
        if (!selStr) return null
        return { __sel: selStr, __uid: uid }
    }),
}))

vi.mock('@renderer/worker/server/services/helpers/makeColor', () => ({
    makeColor: vi.fn((_ctx: unknown, value: string, uid: number) => ({
        __color: value,
        __uid: uid,
    })),
}))

describe('setRendererColoring — Phase 1 new cases', () => {
    beforeEach(() => vi.clearAllMocks())

    // The Default entry must hand back the default PAINTING, not a bare
    // PaintColoring -- an empty table read as "the menu did nothing".
    it('paint-type-paint assigns a PaintColoring seeded with the default painting', () => {
        const { ctx, createObj, setColoring, appendPaint } = makeFixture()
        const res = services.setRendererColoring(ctx, baseArgs('paint-type-paint'))
        expect(res).toEqual({ ok: true })
        expect(createObj).toHaveBeenCalledWith('PaintColoring')
        // makeSel / makeColor are mocked to `{ __sel }` / `{ __color }`; the
        // scene uid (7) scopes both.
        expect(appendPaint.mock.calls).toEqual([
            [{ __sel: 'sheet', __uid: 7 }, { __color: 'SteelBlue', __uid: 7 }],
            [{ __sel: 'helix', __uid: 7 }, { __color: 'khaki', __uid: 7 }],
            [{ __sel: 'nucleic', __uid: 7 }, { __color: 'yellow', __uid: 7 }],
            [{ __sel: '*', __uid: 7 }, { __color: 'FloralWhite', __uid: 7 }],
        ])
        expect(setColoring).toHaveBeenCalledWith(
            expect.objectContaining({ __coloring: 'PaintColoring' }),
        )
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

describe('setRendererColoring — isosurf (MOLFANC) cases', () => {
    beforeEach(() => vi.clearAllMocks())

    it('paint-type-paint forces colormode="molecule" and auto-picks the first MolCoord as target', () => {
        const { ctx, setColormode, setTarget } = makeFixture({
            typeName: 'isosurf',
            initialTarget: '',
            sceneObjects: [
                { type: 'DensityMap', name: 'map1' },
                { type: 'MolCoord', name: 'mol1' },
                { type: 'MolCoord', name: 'mol2' },
            ],
        })
        const res = services.setRendererColoring(ctx, baseArgs('paint-type-paint'))
        expect(res).toEqual({ ok: true })
        expect(setColormode).toHaveBeenCalledWith('molecule')
        expect(setTarget).toHaveBeenCalledWith('mol1')
    })

    it('does not overwrite an already-set target', () => {
        const { ctx, setColormode, setTarget } = makeFixture({
            typeName: 'isosurf',
            initialTarget: 'molX',
            sceneObjects: [{ type: 'MolCoord', name: 'mol1' }],
        })
        services.setRendererColoring(ctx, baseArgs('paint-type-cpk'))
        expect(setColormode).toHaveBeenCalledWith('molecule')
        expect(setTarget).not.toHaveBeenCalled()
    })

    it('paint-type-solid resets coloring and switches colormode back to "solid"', () => {
        const { ctx, resetProp, setColormode } = makeFixture({
            typeName: 'isosurf',
            initialTarget: '',
        })
        const res = services.setRendererColoring(ctx, baseArgs('paint-type-solid'))
        expect(res).toEqual({ ok: true })
        expect(resetProp).toHaveBeenCalledWith('coloring')
        expect(setColormode).toHaveBeenCalledWith('solid')
    })

    // molsurf is colormode-governed like isosurf: the Coloring panel is the
    // only UI that can move its colormode (the Inspector row was dropped), so
    // Solid / Reset must take it back to "solid" -- otherwise the MOLFANC /
    // potential / multigrad path keeps overriding the solid defaultcolor.
    it('paint-type-solid on molsurf also switches colormode back to "solid"', () => {
        const { ctx, resetProp, setColormode } = makeFixture({ typeName: 'molsurf' })
        services.setRendererColoring(ctx, baseArgs('paint-type-solid'))
        expect(resetProp).toHaveBeenCalledWith('coloring')
        expect(setColormode).toHaveBeenCalledWith('solid')
    })

    it('paint-type-resetdef on molsurf resets both coloring and colormode', () => {
        const { ctx, resetProp } = makeFixture({ typeName: 'molsurf' })
        services.setRendererColoring(ctx, baseArgs('paint-type-resetdef'))
        expect(resetProp).toHaveBeenCalledWith('coloring')
        expect(resetProp).toHaveBeenCalledWith('colormode')
    })

    // dsurface / dsurf2 have no "solid" entry, so Solid takes the only other
    // mode they have. Leaving colormode alone (what this used to do) meant the
    // item did nothing at all while the renderer sat in potential mode.
    it('paint-type-solid on dsurface falls back to "molecule"', () => {
        const { ctx, resetProp, setColormode } = makeFixture({ typeName: 'dsurface' })
        services.setRendererColoring(ctx, baseArgs('paint-type-solid'))
        expect(resetProp).toHaveBeenCalledWith('coloring')
        expect(setColormode).toHaveBeenCalledWith('molecule')
    })

    it('paint-type-solid leaves colormode alone on a renderer that has none', () => {
        const { ctx, resetProp, setColormode } = makeFixture({ typeName: 'cartoon' })
        services.setRendererColoring(ctx, baseArgs('paint-type-solid'))
        expect(resetProp).toHaveBeenCalledWith('coloring')
        expect(setColormode).not.toHaveBeenCalled()
    })

    it('paint-type-resetdef resets both coloring and colormode', () => {
        const { ctx, resetProp } = makeFixture({
            typeName: 'isosurf',
            initialTarget: '',
        })
        services.setRendererColoring(ctx, baseArgs('paint-type-resetdef'))
        expect(resetProp).toHaveBeenCalledWith('coloring')
        expect(resetProp).toHaveBeenCalledWith('colormode')
    })
})

describe('setRendererColoringTarget', () => {
    beforeEach(() => vi.clearAllMocks())

    it('writes the target name via setProp inside an undo txn', () => {
        const { ctx, setProp, startUndoTxn, commitUndoTxn } = makeFixture({
            typeName: 'isosurf',
            initialTarget: '',
        })
        const res = services.setRendererColoringTarget(ctx, {
            sceneId: 1,
            rendId: 100,
            targetKind: 'renderer',
            targetName: 'mol2',
        })
        expect(res).toEqual({ ok: true })
        expect(setProp).toHaveBeenCalledWith('target', 'mol2')
        expect(startUndoTxn).toHaveBeenCalledWith('Change coloring target')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('refuses renderers without a target property', () => {
        const { ctx, setProp } = makeFixture({ typeName: 'cartoon' })
        const res = services.setRendererColoringTarget(ctx, {
            sceneId: 1,
            rendId: 100,
            targetName: 'mol2',
        })
        expect(res).toEqual({ ok: false })
        expect(setProp).not.toHaveBeenCalled()
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
    /** Initial scalar properties on the coloring (CPK col_C, Rainbow mode, ...). */
    coloringProps?: Record<string, unknown>
    /** When set, the renderer exposes a `colormode` property with this value. */
    colormode?: string
    /** When set, the renderer exposes a `target` property with this value. */
    target?: string
    /** When true, the renderer exposes a `multi_grad` property. */
    multiGrad?: boolean
}

interface ObjectSpec {
    id: number
    name: string
    /** When omitted, the object's `coloring` is undefined (filtered out). */
    coloringClass?: string | null
    defaultColor?: string
    paintEntries?: PaintEntry[]
    coloringProps?: Record<string, unknown>
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

        // Scalar properties on the ColoringScheme (CPK col_C, Rainbow mode,
        // Bfac lowpar...) live on the coloring object directly. `setProp`
        // mutates this dict so `setColoringProp` tests can observe writes.
        const props: Record<string, unknown> = { ...(spec.coloringProps ?? {}) }
        const setProp = vi.fn((name: string, value: unknown) => {
            props[name] = value
        })

        const coloring =
            spec.coloringClass === null || spec.coloringClass === undefined
                ? undefined
                : new Proxy({
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
                      setProp,
                  }, {
                      get(target: Record<string, unknown>, key: string) {
                          // Methods + size + getClassName first; scalar
                          // props fall through.
                          if (key in target) return target[key]
                          return props[key]
                      },
                  })

        const typeName =
            (spec as RendSpec).typeName ?? (spec as ObjectSpec).name ?? ''
        const rend: Record<string, unknown> = {
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
        // Optional renderer-level props (MOLFANC / multigrad probes).
        const rspec = spec as RendSpec
        if (rspec.colormode !== undefined) rend.colormode = rspec.colormode
        if (rspec.target !== undefined) rend.target = rspec.target
        if (rspec.multiGrad) rend.multi_grad = { __mg: true }

        return {
            rend,
            spies: {
                append, insertBefore, removeAt, changeAt,
                getSelAt, getColorAt, setDefaultColor, resetProp,
                setColoring, hasPropDefault, setProp,
            },
            getEntries: () => paintEntries,
            getProps: () => props,
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

    // `PaintColoring` gets an `append` seam so the default-painting rows the
    // Default entry seeds are observable (see `createDefPaintColoring`).
    const appendPaint = vi.fn()
    const createObj = vi.fn((cls: string) =>
        cls === 'PaintColoring'
            ? { __coloring: cls, append: appendPaint }
            : { __coloring: cls },
    )

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

    it('reports hasColoring and the MOLFANC target for isosurf', () => {
        const { ctx } = makeRichFixture({
            objects: [{
                id: 10, name: 'mtz1', rends: [{
                    id: 100, name: 'iso1', typeName: 'isosurf',
                    coloringClass: 'SolidColoring',
                    colormode: 'molecule', target: 'mol1', multiGrad: true,
                }],
            }],
        })
        const res = services.getRendererColoringState(ctx, { sceneId: 1, rendId: 100 })
        expect(res.ok).toBe(true)
        expect(res.hasColoring).toBe(true)
        expect(res.molFancTarget).toBe('mol1')
    })

    it('reports hasColoring:false and no molFancTarget for a plain map renderer', () => {
        const { ctx } = makeRichFixture({
            objects: [{
                id: 10, name: 'mtz1', rends: [{
                    id: 100, name: 'ctr1', typeName: 'contour',
                    coloringClass: null,
                    colormode: 'solid', multiGrad: true,
                }],
            }],
        })
        const res = services.getRendererColoringState(ctx, { sceneId: 1, rendId: 100 })
        expect(res.hasColoring).toBe(false)
        expect(res.molFancTarget).toBeUndefined()
    })

    // The "Coloring mol" selector names the molecule a surface with no atoms
    // of its own should colour by. A direct-surface renderer is attached to a
    // MolCoord and colours from it, so the selector would offer a choice that
    // changes nothing -- and the write behind it would store an unread name.
    it.each(['dsurface', 'dsurf2'])(
        'reports no molFancTarget for %s, which colours from its own molecule',
        (typeName) => {
            const { ctx } = makeRichFixture({
                objects: [{
                    id: 10, name: 'mol1', rends: [{
                        id: 100, name: 'surf1', typeName,
                        coloringClass: 'SolidColoring',
                        colormode: 'molecule', target: 'mol1',
                    }],
                }],
            })
            const res = services.getRendererColoringState(ctx, { sceneId: 1, rendId: 100 })
            expect(res.ok).toBe(true)
            expect(res.colormode).toBe('molecule')
            expect(res.molFancTarget).toBeUndefined()
        },
    )

    it.each(['dsurface', 'dsurf2'])(
        'refuses a coloring-target write on %s',
        (typeName) => {
            const { ctx } = makeRichFixture({
                objects: [{
                    id: 10, name: 'mol1', rends: [{
                        id: 100, name: 'surf1', typeName,
                        coloringClass: 'SolidColoring',
                        colormode: 'molecule', target: 'mol1',
                    }],
                }],
            })
            const res = services.setRendererColoringTarget(ctx, {
                sceneId: 1, rendId: 100, targetName: 'mol2',
            })
            expect(res).toEqual({ ok: false })
        },
    )

    it('does not expose an unrelated target prop as molFancTarget (no colormode)', () => {
        // DisoRenderer-like: has coloring + a `target` that names a renderer,
        // but no colormode -- the colormode gate must keep it out.
        const { ctx } = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'diso1', typeName: 'disorder',
                    coloringClass: 'SolidColoring',
                    target: 'cartoon1',
                }],
            }],
        })
        const res = services.getRendererColoringState(ctx, { sceneId: 1, rendId: 100 })
        expect(res.hasColoring).toBe(true)
        expect(res.molFancTarget).toBeUndefined()
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

// -------------------------------------------------------------
// Object-level coloring (targetKind: 'object')
// -------------------------------------------------------------

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

// -------------------------------------------------------------
// CPK / Rainbow / Bfac decks
// -------------------------------------------------------------

describe('setRendererColoring -- paint-type-cpk', () => {
    beforeEach(() => vi.clearAllMocks())

    // The three CPK ids build the same object and differ only in col_C, so pin
    // the carbon colour per id -- that IS the whole contract between them.
    it.each([
        ['paint-type-cpk', '$molcol'],
        ['paint-type-cpk-darkgray', '#404040'],
        ['paint-type-cpk-lightgray', '#C0C0C0'],
    ] as const)('%s instantiates CPKColoring with col_C=%s under undo', (id, carbon) => {
        const { ctx, createObj, setColoring, startUndoTxn } = makeFixture()
        const res = services.setRendererColoring(ctx, baseArgs(id))
        expect(res).toEqual({ ok: true })
        expect(createObj).toHaveBeenCalledWith('CPKColoring')
        expect(setColoring).toHaveBeenCalledWith({
            __coloring: 'CPKColoring',
            // makeColor is mocked to `{ __color, __uid }`; uid is scene.uid.
            col_C: { __color: carbon, __uid: 7 },
        })
        expect(startUndoTxn).toHaveBeenCalledWith('Change coloring')
    })
})

describe('getRendererColoringState -- per-class params', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns cpkColors for CPKColoring', () => {
        const { ctx } = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'cartoon',
                    coloringClass: 'CPKColoring',
                    coloringProps: {
                        col_C: { toString: () => '#A0A0A0' },
                        col_N: { toString: () => '#0000FF' },
                        col_O: { toString: () => '#FF0000' },
                        col_S: { toString: () => '#FFFF00' },
                        col_P: { toString: () => '#FFA500' },
                        col_H: { toString: () => '#FFFFFF' },
                        col_X: { toString: () => '#888888' },
                    },
                }],
            }],
        })
        const res = services.getRendererColoringState(ctx, { sceneId: 1, rendId: 100 })
        expect(res.className).toBe('CPKColoring')
        expect(res.cpkColors).toEqual({
            colC: '#A0A0A0', colN: '#0000FF', colO: '#FF0000', colS: '#FFFF00',
            colP: '#FFA500', colH: '#FFFFFF', colX: '#888888',
        })
        expect(res.paintEntries).toEqual([])
    })

    it('returns rainbowParams for RainbowColoring', () => {
        const { ctx } = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'cartoon',
                    coloringClass: 'RainbowColoring',
                    coloringProps: {
                        mode: 'chain', incr_mode: 'resid',
                        start_hue: 0, end_hue: 240,
                        sat: 0.8, bri: 0.9,
                    },
                }],
            }],
        })
        const res = services.getRendererColoringState(ctx, { sceneId: 1, rendId: 100 })
        expect(res.className).toBe('RainbowColoring')
        expect(res.rainbowParams).toEqual({
            mode: 'chain', incrMode: 'resid',
            startHue: 0, endHue: 240,
            saturation: 0.8, brightness: 0.9,
        })
    })

    it('returns bfacParams for BfacColoring', () => {
        const { ctx } = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'cartoon',
                    coloringClass: 'BfacColoring',
                    coloringProps: {
                        mode: 'bfac',
                        lowcol: { toString: () => '#0000FF' },
                        highcol: { toString: () => '#FF0000' },
                        auto: 'mol',
                        lowpar: 10, highpar: 50,
                    },
                }],
            }],
        })
        const res = services.getRendererColoringState(ctx, { sceneId: 1, rendId: 100 })
        expect(res.className).toBe('BfacColoring')
        expect(res.bfacParams).toEqual({
            mode: 'bfac',
            lowColor: '#0000FF', highColor: '#FF0000',
            autoMode: 'mol',
            lowParam: 10, highParam: 50,
        })
    })
})

describe('setColoringProp', () => {
    beforeEach(() => vi.clearAllMocks())

    function cpkFixture() {
        return makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'cartoon',
                    coloringClass: 'CPKColoring',
                    coloringProps: { col_C: { toString: () => '#A0A0A0' } },
                }],
            }],
        })
    }

    it('writes a numeric prop via coloring.setProp under undo', () => {
        const f = cpkFixture()
        const res = services.setColoringProp(f.ctx, {
            sceneId: 1, rendId: 100,
            propName: 'sat', propValue: 0.5,
        })
        expect(res).toEqual({ ok: true })
        expect(f.rendWrappers.get(100)!.spies.setProp)
            .toHaveBeenCalledWith('sat', 0.5)
        expect(f.startUndoTxn).toHaveBeenCalledWith('Change coloring property')
    })

    it('writes a string-enum prop via coloring.setProp', () => {
        const f = cpkFixture()
        services.setColoringProp(f.ctx, {
            sceneId: 1, rendId: 100,
            propName: 'mode', propValue: 'chain',
        })
        expect(f.rendWrappers.get(100)!.spies.setProp)
            .toHaveBeenCalledWith('mode', 'chain')
    })

    it('compiles colour-whitelisted props through makeColor and passes .wrapped', () => {
        const f = cpkFixture()
        services.setColoringProp(f.ctx, {
            sceneId: 1, rendId: 100,
            propName: 'col_C', propValue: '#FF0000',
        })
        // makeColor was mocked to return `{ __color, __uid }`; the worker
        // unwraps via `.wrapped`. Our mock objects have no `.wrapped`
        // member so we receive `undefined` -- the contract being pinned is
        // that the value passed is NOT the raw string "#FF0000".
        const call = f.rendWrappers.get(100)!.spies.setProp.mock.calls[0]
        expect(call[0]).toBe('col_C')
        expect(call[1]).not.toBe('#FF0000')
    })

    it('routes lowcol / highcol through makeColor too (Bfac deck)', () => {
        const f = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'cartoon',
                    coloringClass: 'BfacColoring',
                    coloringProps: {},
                }],
            }],
        })
        services.setColoringProp(f.ctx, {
            sceneId: 1, rendId: 100,
            propName: 'lowcol', propValue: '#0000FF',
        })
        const call = f.rendWrappers.get(100)!.spies.setProp.mock.calls[0]
        expect(call[0]).toBe('lowcol')
        expect(call[1]).not.toBe('#0000FF')
    })

    it('materializes default coloring before writing (UXP guard)', () => {
        const f = cpkFixture()
        f.rendWrappers.get(100)!.spies.hasPropDefault.mockReturnValue(true)
        services.setColoringProp(f.ctx, {
            sceneId: 1, rendId: 100,
            propName: 'sat', propValue: 0.5,
        })
        expect(f.rendWrappers.get(100)!.spies.hasPropDefault)
            .toHaveBeenCalledWith('coloring')
        expect(f.rendWrappers.get(100)!.spies.setColoring).toHaveBeenCalled()
    })

    it('rejects when coloring class is unset', () => {
        const f = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1', rends: [{
                    id: 100, name: 'r1', typeName: 'simple',
                    coloringClass: null,
                }],
            }],
        })
        const res = services.setColoringProp(f.ctx, {
            sceneId: 1, rendId: 100,
            propName: 'mode', propValue: 'bfac',
        })
        expect(res).toEqual({ ok: false })
    })

    it('targetKind "object" routes the write to scene.getObject', () => {
        const f = makeRichFixture({
            objects: [{
                id: 10, name: 'mol1',
                coloringClass: 'CPKColoring',
                coloringProps: {},
                rends: [],
            }],
        })
        services.setColoringProp(f.ctx, {
            sceneId: 1, rendId: 10, targetKind: 'object',
            propName: 'sat', propValue: 0.7,
        })
        expect(f.scene.getObject).toHaveBeenCalledWith(10)
    })
})

// ============================================================
// Elepot deck
// ============================================================
//
// Elepot props live on the surface renderer itself (not on a coloring
// scheme), so the rich-fixture proxy that targets `coloring.setProp`
// doesn't fit. Build a focused fixture per test instead.

interface ElepotRendOpts {
    typeName?: string // 'molsurf' | 'dsurface' | other
    colormode?: string
    elepot?: string
    rampAbove?: boolean
    lowpar?: number
    midpar?: number
    highpar?: number
    lowcol?: string
    midcol?: string
    highcol?: string
    /** Extra scene objects to expose in getSceneDataJSON for the selector tests. */
    sceneObjects?: { id: number; name: string; type: string }[]
}

function makeElepotFixture(opts: ElepotRendOpts = {}) {
    const {
        typeName = 'molsurf',
        colormode = 'potential',
        elepot = '',
        rampAbove = false,
        lowpar = -1, midpar = 0, highpar = 1,
        lowcol = '#0000FF', midcol = '#FFFFFF', highcol = '#FF0000',
        sceneObjects = [],
    } = opts

    const setProp = vi.fn()
    const props: Record<string, unknown> = {
        type_name: typeName,
        colormode,
        elepot,
        ramp_above: rampAbove,
        lowpar, midpar, highpar,
        lowcol: { toString: () => lowcol },
        midcol: { toString: () => midcol },
        highcol: { toString: () => highcol },
    }
    const rend = new Proxy({ setProp }, {
        get(target: Record<string, unknown>, key: string) {
            if (key in target) return target[key]
            return props[key]
        },
        set(_t, key: string, value: unknown) {
            props[key as string] = value
            return true
        },
    })

    const sceneDataJSON: unknown[] = [
        { type: '', ID: 1, name: 'scene' },
        // Default: include a single molsurf object containing the rend.
        { type: 'MolSurfObj', ID: 50, name: 'surf1', rends: [{
            ID: 100, name: 'r1', type: typeName,
        }] },
        ...sceneObjects.map((o) => ({ ID: o.id, name: o.name, type: o.type })),
    ]

    const scene = {
        uid: 7,
        getRenderer: vi.fn((id: number) => (id === 100 ? rend : null)),
        getObject: vi.fn(() => null),
        getSceneDataJSON: vi.fn(() => JSON.stringify(sceneDataJSON)),
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
    }

    const ctx = {
        sceMgr: { getScene: vi.fn(() => scene) },
        svc: { createObj: vi.fn() },
        styleMgr: { getStyleNamesJSON: vi.fn(() => '[]') },
    } as unknown as WorkerContext

    return { ctx, scene, rend, setProp, props }
}

describe('getRendererColoringState -- Elepot deck routing', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns elepotParams when surface + colormode == "potential"', () => {
        const { ctx } = makeElepotFixture({
            typeName: 'molsurf',
            colormode: 'potential',
            elepot: 'pot1', rampAbove: true,
            lowpar: -1.5, midpar: 0.0, highpar: 1.5,
            lowcol: '#0000FF', midcol: '#FFFFFF', highcol: '#FF0000',
        })
        const res = services.getRendererColoringState(ctx, {
            sceneId: 1, rendId: 100,
        })
        expect(res.ok).toBe(true)
        expect(res.surfaceType).toBe('molsurf')
        expect(res.colormode).toBe('potential')
        expect(res.elepotParams).toEqual({
            elepot: 'pot1',
            rampAbove: true,
            lowParam: -1.5, midParam: 0, highParam: 1.5,
            lowColor: '#0000FF', midColor: '#FFFFFF', highColor: '#FF0000',
        })
    })

    it('omits elepotParams when surface but colormode != "potential"', () => {
        const { ctx } = makeElepotFixture({
            typeName: 'molsurf', colormode: 'molecule',
        })
        const res = services.getRendererColoringState(ctx, {
            sceneId: 1, rendId: 100,
        })
        expect(res.elepotParams).toBeUndefined()
        expect(res.surfaceType).toBe('molsurf')
        expect(res.colormode).toBe('molecule')
    })

    it('omits elepotParams on non-surface renderers even with potential mode', () => {
        const { ctx } = makeElepotFixture({
            typeName: 'cartoon', colormode: 'potential',
        })
        const res = services.getRendererColoringState(ctx, {
            sceneId: 1, rendId: 100,
        })
        expect(res.elepotParams).toBeUndefined()
        expect(res.surfaceType).toBe('cartoon')
        expect(res.colormode).toBe('')
    })

    it('accepts dsurface as an Elepot-capable surface', () => {
        const { ctx } = makeElepotFixture({
            typeName: 'dsurface', colormode: 'potential',
        })
        const res = services.getRendererColoringState(ctx, {
            sceneId: 1, rendId: 100,
        })
        expect(res.elepotParams).toBeDefined()
        expect(res.surfaceType).toBe('dsurface')
    })
})

describe('listElePotMapObjects', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns only ElePotMap-typed objects', () => {
        const { ctx } = makeElepotFixture({
            sceneObjects: [
                { id: 10, name: 'mol1', type: 'PDBMol' },
                { id: 11, name: 'pot1', type: 'ElePotMap' },
                { id: 12, name: 'pot2', type: 'ElePotMap' },
                { id: 13, name: 'dmap', type: 'DensityMap' },
            ],
        })
        const res = services.listElePotMapObjects(ctx, { sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(res.objects).toEqual([
            { objId: 11, name: 'pot1' },
            { objId: 12, name: 'pot2' },
        ])
    })

    it('returns an empty list when the scene has no ElePotMap', () => {
        const { ctx } = makeElepotFixture()
        const res = services.listElePotMapObjects(ctx, { sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(res.objects).toEqual([])
    })
})

describe('setRendererElepotProp', () => {
    beforeEach(() => vi.clearAllMocks())

    it('writes a numeric prop on the renderer under undo', () => {
        const f = makeElepotFixture()
        const res = services.setRendererElepotProp(f.ctx, {
            sceneId: 1, rendId: 100, propName: 'highpar', propValue: 2.5,
        })
        expect(res).toEqual({ ok: true })
        expect(f.setProp).toHaveBeenCalledWith('highpar', 2.5)
        expect(f.scene.startUndoTxn).toHaveBeenCalledWith('Change Elepot coloring')
        expect(f.scene.commitUndoTxn).toHaveBeenCalled()
    })

    it('writes a boolean ramp_above prop', () => {
        const f = makeElepotFixture()
        services.setRendererElepotProp(f.ctx, {
            sceneId: 1, rendId: 100, propName: 'ramp_above', propValue: true,
        })
        expect(f.setProp).toHaveBeenCalledWith('ramp_above', true)
    })

    it('writes the elepot object name as a string', () => {
        const f = makeElepotFixture()
        services.setRendererElepotProp(f.ctx, {
            sceneId: 1, rendId: 100, propName: 'elepot', propValue: 'pot1',
        })
        expect(f.setProp).toHaveBeenCalledWith('elepot', 'pot1')
    })

    it('compiles colour-valued props through makeColor (not the raw string)', () => {
        const f = makeElepotFixture()
        services.setRendererElepotProp(f.ctx, {
            sceneId: 1, rendId: 100, propName: 'lowcol', propValue: '#0000FF',
        })
        const call = f.setProp.mock.calls[0]
        expect(call[0]).toBe('lowcol')
        // makeColor wraps the string in { __color, __uid }; the worker
        // unwraps via .wrapped, which our mock leaves undefined. The
        // contract being pinned is that the raw string is not passed.
        expect(call[1]).not.toBe('#0000FF')
    })

    it('rejects on non-surface renderers', () => {
        const f = makeElepotFixture({ typeName: 'cartoon' })
        const res = services.setRendererElepotProp(f.ctx, {
            sceneId: 1, rendId: 100, propName: 'highpar', propValue: 1,
        })
        expect(res).toEqual({ ok: false })
        expect(f.setProp).not.toHaveBeenCalled()
    })
})

describe('setRendererColoring -- paint-type-elepot', () => {
    beforeEach(() => vi.clearAllMocks())

    it('sets colormode = "potential" on a surface renderer', () => {
        const f = makeElepotFixture({
            typeName: 'molsurf', colormode: 'molecule', elepot: 'pot1',
        })
        const res = services.setRendererColoring(f.ctx, {
            sceneId: 1, rendId: 100, coloringId: 'paint-type-elepot',
        })
        expect(res).toEqual({ ok: true })
        expect(f.props.colormode).toBe('potential')
        // elepot was already set so don't overwrite it.
        expect(f.props.elepot).toBe('pot1')
        expect(f.scene.startUndoTxn).toHaveBeenCalledWith('Change to elepot coloring')
    })

    it('picks the first ElePotMap when the renderer has no elepot yet', () => {
        const f = makeElepotFixture({
            typeName: 'molsurf', colormode: 'molecule', elepot: '',
            sceneObjects: [
                { id: 20, name: 'potA', type: 'ElePotMap' },
                { id: 21, name: 'potB', type: 'ElePotMap' },
            ],
        })
        services.setRendererColoring(f.ctx, {
            sceneId: 1, rendId: 100, coloringId: 'paint-type-elepot',
        })
        expect(f.props.elepot).toBe('potA')
        expect(f.props.colormode).toBe('potential')
    })

    it('leaves elepot empty when the scene has no ElePotMap', () => {
        const f = makeElepotFixture({
            typeName: 'molsurf', colormode: 'molecule', elepot: '',
        })
        services.setRendererColoring(f.ctx, {
            sceneId: 1, rendId: 100, coloringId: 'paint-type-elepot',
        })
        expect(f.props.elepot).toBe('')
        expect(f.props.colormode).toBe('potential')
    })

    it('refuses on non-surface renderers', () => {
        const f = makeElepotFixture({ typeName: 'cartoon' })
        const res = services.setRendererColoring(f.ctx, {
            sceneId: 1, rendId: 100, coloringId: 'paint-type-elepot',
        })
        expect(res).toEqual({ ok: false })
        expect(f.scene.startUndoTxn).not.toHaveBeenCalled()
    })
})

/*
 * Reported bug: on a scene with no ElePotMap, picking Electrostatic potential
 * put the renderer into potential mode with an empty target, and from there no
 * coloring choice had any effect -- C++ logged `MolSurfRend> "" is not a scalar
 * object.` on every rebuild while the panel appeared to accept each click.
 *
 * The cause was one stale predicate: the "put this renderer back into molecule
 * mode" gate listed molsurf and isosurf, while the gate that lets a renderer
 * ENTER potential mode had grown to include dsurface and dsurf2. Entry without
 * a matching exit is the shape of the bug, so these tests pin the round trip
 * for every renderer whose colormode governs its coloring -- including contour,
 * which could reach multigrad the same way.
 */
describe('setRendererColoring — leaving a special colormode', () => {
    beforeEach(() => vi.clearAllMocks())

    const MOLECULE_COLORINGS: RendColoringId[] = [
        'paint-type-cpk',
        'paint-type-cpk-darkgray',
        'paint-type-cpk-lightgray',
        'paint-type-bfac',
        'paint-type-rainbow',
        'paint-type-paint',
    ]

    for (const typeName of ['dsurf2', 'dsurface', 'molsurf', 'isosurf', 'contour']) {
        for (const coloringId of MOLECULE_COLORINGS) {
            it(`${typeName}: ${coloringId} leaves the special mode for "molecule"`, () => {
                const { ctx, setColormode } = makeFixture({ typeName })
                const res = services.setRendererColoring(ctx, baseArgs(coloringId))
                expect(res).toEqual({ ok: true })
                expect(setColormode).toHaveBeenCalledWith('molecule')
            })
        }

        it(`${typeName}: a style coloring also leaves the special mode`, () => {
            const { ctx, setColormode } = makeFixture({
                typeName,
                styleNamesJSON: { 7: JSON.stringify(['DefaultHSCPaint']) },
            })
            services.setRendererColoring(ctx, baseArgs('style-DefaultHSCPaint'))
            expect(setColormode).toHaveBeenCalledWith('molecule')
        })

        it(`${typeName}: Reset to default style resets colormode too`, () => {
            const { ctx, resetProp } = makeFixture({ typeName })
            services.setRendererColoring(ctx, baseArgs('paint-type-resetdef'))
            expect(resetProp).toHaveBeenCalledWith('coloring')
            expect(resetProp).toHaveBeenCalledWith('colormode')
        })
    }

    // The reference molecule is only seeded where molecule mode needs one. The
    // direct-surface pair are MolRenderers that colour from getClientMol(), so
    // their `target` is an event hook the colouring never reads -- writing it
    // would put a molecule name on a property with no effect.
    it('seeds the MOLFANC target on molsurf, which has no atoms of its own', () => {
        const { ctx, setTarget } = makeFixture({
            typeName: 'molsurf',
            initialTarget: '',
            sceneObjects: [{ type: 'MolCoord', name: 'mol1' }],
        })
        services.setRendererColoring(ctx, baseArgs('paint-type-cpk'))
        expect(setTarget).toHaveBeenCalledWith('mol1')
    })

    it('does not seed a target on dsurf2, which colours from its own molecule', () => {
        const { ctx, setTarget, setColormode } = makeFixture({
            typeName: 'dsurf2',
            initialTarget: '',
            sceneObjects: [{ type: 'MolCoord', name: 'mol1' }],
        })
        services.setRendererColoring(ctx, baseArgs('paint-type-cpk'))
        expect(setColormode).toHaveBeenCalledWith('molecule')
        expect(setTarget).not.toHaveBeenCalled()
    })

    // A renderer with no colormode at all must be left untouched: writing the
    // property would throw at the wrapper.
    it('never writes colormode on a renderer that does not have one', () => {
        const { ctx, setColormode } = makeFixture({ typeName: 'cartoon' })
        for (const id of MOLECULE_COLORINGS) {
            services.setRendererColoring(ctx, baseArgs(id))
        }
        expect(setColormode).not.toHaveBeenCalled()
    })
})
