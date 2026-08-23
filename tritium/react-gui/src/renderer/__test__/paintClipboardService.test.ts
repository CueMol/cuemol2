/**
 * @file __test__/paintClipboardService.test.ts
 * @description Degrade-detection tests for the Paint deck's clipboard
 * services (Copy / Cut / Paste) and Delete-all.
 *
 * What is pinned here is the behaviour that is easy to break silently:
 *   - the clipboard holds *strings*, so a paste recompiles against the
 *     destination scene rather than reusing the source wrappers;
 *   - insert-before pastes in reverse so the block keeps clipboard order
 *     (UXP `_pasteImpl`), while no selection appends;
 *   - Cut deletes descending under ONE undo txn, so a single Undo restores
 *     every cut row;
 *   - each mutation materializes a style-default coloring inside its own
 *     transaction before touching the list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '../worker/server/services/rendererColoring.service'
import { _resetPaintClipboardForTest } from '../worker/server/services/coloring/paintClipboard'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

interface FixtureOpts {
    /** Initial rows, as the (sel, color) string pairs C++ would stringify to. */
    rows?: [string, string][]
    coloringClass?: string
    sceneExists?: boolean
    rendExists?: boolean
    /** True when the renderer's `coloring` is still the style default. */
    propDefault?: boolean
    /** Selection strings that fail to compile at paste time. */
    badSels?: string[]
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        rows = [['A', '#f00'], ['B', '#0f0'], ['C', '#00f']],
        coloringClass = 'PaintColoring',
        sceneExists = true,
        rendExists = true,
        propDefault = false,
        badSels = [],
    } = opts

    // The live list, mutated by the service under test. Entries are the
    // wrapper stand-ins the C++ getters would hand back.
    const list = rows.map(([sel, col]) => ({
        sel: { toString: () => sel },
        col: { toString: () => col },
    }))

    const removeAt = vi.fn((i: number) => {
        list.splice(i, 1)
        return true
    })
    const append = vi.fn((sel: unknown, col: unknown) => {
        list.push({ sel, col } as (typeof list)[number])
    })
    const insertBefore = vi.fn((i: number, sel: unknown, col: unknown) => {
        list.splice(i, 0, { sel, col } as (typeof list)[number])
    })
    const clear = vi.fn(() => {
        list.length = 0
    })

    const coloring = {
        getClassName: () => coloringClass,
        get size() {
            return list.length
        },
        getSelAt: vi.fn((i: number) => list[i]?.sel ?? null),
        getColorAt: vi.fn((i: number) => list[i]?.col ?? null),
        removeAt,
        append,
        insertBefore,
        clear,
    }

    const setColoring = vi.fn()
    const rend = {
        get coloring() {
            return coloring
        },
        set coloring(v: unknown) {
            setColoring(v)
        },
        hasPropDefault: vi.fn(() => propDefault),
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

    // makeSel compiles through a fresh SelCommand; reject the sel strings
    // the fixture marks as no longer resolvable.
    const createObj = vi.fn(() => ({
        __sel: true as const,
        compiled: '',
        compile(str: string) {
            this.compiled = str
            return !badSels.includes(str)
        },
    }))
    const compileColor = vi.fn((str: string) => ({ __color: str }))

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
        svc: { createObj },
        styleMgr: { compileColor },
    } as unknown as WorkerContext

    return {
        ctx, scene, rend, coloring, list, setColoring,
        removeAt, append, insertBefore, clear,
        startUndoTxn, commitUndoTxn, createObj, compileColor,
    }
}

/**
 * Selection string of a list row. Original rows carry a stringifying
 * stand-in; pasted rows carry the compiled SelCommand stub, which records
 * the string it was compiled from.
 */
function selOf(entry: { sel: unknown }): string {
    const sel = entry.sel as { compiled?: string }
    return sel.compiled ?? String(entry.sel)
}

const TARGET = { sceneId: 1, rendId: 100 } as const

beforeEach(() => {
    vi.clearAllMocks()
    _resetPaintClipboardForTest()
})

describe('copyPaintEntries', () => {
    it('snapshots the selected rows and reports the clipboard size', () => {
        const { ctx, startUndoTxn } = makeFixture()
        expect(services.copyPaintEntries(ctx, { ...TARGET, idxs: [0, 2] }))
            .toEqual({ ok: true, count: 2 })
        // Copying is a pure read: no scene mutation, so no undo entry.
        expect(startUndoTxn).not.toHaveBeenCalled()
    })

    it('normalizes the index list (sorted, de-duplicated, in range)', () => {
        const { ctx, coloring } = makeFixture()
        expect(services.copyPaintEntries(ctx, { ...TARGET, idxs: [2, 0, 2, 9, -1] }))
            .toEqual({ ok: true, count: 2 })
        expect(coloring.getSelAt.mock.calls.map((c) => c[0])).toEqual([0, 2])
    })

    it('leaves the previous clipboard content when a copy is refused', () => {
        const { ctx } = makeFixture()
        services.copyPaintEntries(ctx, { ...TARGET, idxs: [0] })
        // Empty selection: the count still reports what Paste would insert.
        expect(services.copyPaintEntries(ctx, { ...TARGET, idxs: [] }))
            .toEqual({ ok: false, count: 1 })
    })

    it('refuses when the target has no PaintColoring', () => {
        const { ctx } = makeFixture({ coloringClass: 'CPKColoring' })
        expect(services.copyPaintEntries(ctx, { ...TARGET, idxs: [0] }))
            .toEqual({ ok: false, count: 0 })
    })
})

describe('cutPaintEntries', () => {
    it('copies then deletes descending under a single undo txn', () => {
        const { ctx, list, removeAt, startUndoTxn, commitUndoTxn } = makeFixture()
        expect(services.cutPaintEntries(ctx, { ...TARGET, idxs: [0, 2] }))
            .toEqual({ ok: true, count: 2 })
        // Descending order: removing 0 first would shift 2 out from under us.
        expect(removeAt.mock.calls.map((c) => c[0])).toEqual([2, 0])
        expect(list.map(selOf)).toEqual(['B'])
        expect(startUndoTxn).toHaveBeenCalledExactlyOnceWith('Cut paint entry')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('materializes a style-default coloring before deleting', () => {
        const { ctx, setColoring, coloring } = makeFixture({ propDefault: true })
        services.cutPaintEntries(ctx, { ...TARGET, idxs: [1] })
        expect(setColoring).toHaveBeenCalledWith(coloring)
    })

    it('deletes nothing when the copy half finds no rows', () => {
        const { ctx, removeAt, startUndoTxn } = makeFixture()
        expect(services.cutPaintEntries(ctx, { ...TARGET, idxs: [7] }))
            .toEqual({ ok: false, count: 0 })
        expect(removeAt).not.toHaveBeenCalled()
        expect(startUndoTxn).not.toHaveBeenCalled()
    })
})

describe('pastePaintEntries', () => {
    it('recompiles the stored strings against the destination scene', () => {
        const src = makeFixture()
        services.copyPaintEntries(src.ctx, { ...TARGET, idxs: [0] })

        // A different renderer in a different scene: paste must not reuse
        // the source wrappers, it must compile "A" / "#f00" afresh.
        const dst = makeFixture({ rows: [] })
        expect(dst.compileColor).not.toHaveBeenCalled()
        expect(services.pastePaintEntries(dst.ctx, { ...TARGET, idx: null }))
            .toEqual({ ok: true, count: 1, startIdx: 0 })
        expect(dst.compileColor).toHaveBeenCalledWith('#f00', 7)
        expect(dst.append).toHaveBeenCalledTimes(1)
        expect(dst.append.mock.calls[0][0]).toMatchObject({ compiled: 'A' })
    })

    it('appends at the end when no row is selected', () => {
        const { ctx, list } = makeFixture()
        services.copyPaintEntries(ctx, { ...TARGET, idxs: [0, 1] })
        expect(services.pastePaintEntries(ctx, { ...TARGET, idx: null }))
            .toEqual({ ok: true, count: 2, startIdx: 3 })
        expect(list).toHaveLength(5)
    })

    it('inserts before the selected row, keeping clipboard order', () => {
        const { ctx, list, insertBefore } = makeFixture()
        services.copyPaintEntries(ctx, { ...TARGET, idxs: [0, 1] })
        expect(services.pastePaintEntries(ctx, { ...TARGET, idx: 2 }))
            .toEqual({ ok: true, count: 2, startIdx: 2 })
        // Inserted at a fixed index in reverse, so A precedes B on the list.
        expect(insertBefore.mock.calls.map((c) => c[0])).toEqual([2, 2])
        expect(list.map(selOf)).toEqual(['A', 'B', 'A', 'B', 'C'])
    })

    it('skips rows whose selection no longer compiles', () => {
        const src = makeFixture()
        services.copyPaintEntries(src.ctx, { ...TARGET, idxs: [0, 1] })
        const dst = makeFixture({ rows: [], badSels: ['A'] })
        expect(services.pastePaintEntries(dst.ctx, { ...TARGET, idx: null }))
            .toEqual({ ok: true, count: 1, startIdx: 0 })
        expect(dst.append).toHaveBeenCalledTimes(1)
    })

    it('is a no-op with an empty clipboard', () => {
        const { ctx, startUndoTxn, append } = makeFixture()
        expect(services.pastePaintEntries(ctx, { ...TARGET, idx: null }))
            .toEqual({ ok: false, count: 0, startIdx: -1 })
        expect(startUndoTxn).not.toHaveBeenCalled()
        expect(append).not.toHaveBeenCalled()
    })
})

describe('clearPaintEntries', () => {
    it('clears the list in one undo txn', () => {
        const { ctx, list, clear, startUndoTxn, commitUndoTxn } = makeFixture()
        expect(services.clearPaintEntries(ctx, TARGET)).toEqual({ ok: true })
        expect(clear).toHaveBeenCalledTimes(1)
        expect(list).toHaveLength(0)
        expect(startUndoTxn).toHaveBeenCalledExactlyOnceWith('Delete all paint entries')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('refuses when the target cannot be resolved', () => {
        for (const o of [{ sceneExists: false }, { rendExists: false }] as const) {
            const { ctx, clear } = makeFixture(o)
            expect(services.clearPaintEntries(ctx, TARGET)).toEqual({ ok: false })
            expect(clear).not.toHaveBeenCalled()
        }
    })
})

describe('getPaintClipboardInfo', () => {
    it('reports the row count so the panel can gate Paste', () => {
        const { ctx } = makeFixture()
        expect(services.getPaintClipboardInfo(ctx, {})).toEqual({ count: 0 })
        services.copyPaintEntries(ctx, { ...TARGET, idxs: [0, 1] })
        expect(services.getPaintClipboardInfo(ctx, {})).toEqual({ count: 2 })
    })
})
