/**
 * @file __test__/paintClipboardService.test.ts
 * @description Degrade-detection tests for the Paint deck's Copy / Cut /
 * Paste row transfer and Delete-all.
 *
 * The services are stateless -- the OS clipboard is the only state -- so
 * Copy returns rows and Paste takes them. What is pinned here is the
 * behaviour that is easy to break silently:
 *   - rows travel as *strings*, so a paste recompiles against the
 *     destination scene rather than reusing the source wrappers (the whole
 *     reason a cross-scene or cross-process paste means anything);
 *   - insert-before pastes in reverse so the block keeps clipboard order
 *     (UXP `_pasteImpl`), while no selection appends;
 *   - Cut deletes descending under ONE undo txn, so a single Undo restores
 *     every cut row;
 *   - each mutation materializes a style-default coloring inside its own
 *     transaction before touching the list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '../worker/server/services/rendererColoring.service'
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
})

describe('copyPaintEntries', () => {
    it('returns the selected rows as their string forms', () => {
        const { ctx, startUndoTxn } = makeFixture()
        expect(services.copyPaintEntries(ctx, { ...TARGET, idxs: [0, 2] }))
            .toEqual({
                ok: true,
                entries: [
                    { selStr: 'A', colorValue: '#f00' },
                    { selStr: 'C', colorValue: '#00f' },
                ],
            })
        // Copying is a pure read: no scene mutation, so no undo entry.
        expect(startUndoTxn).not.toHaveBeenCalled()
    })

    it('normalizes the index list (sorted, de-duplicated, in range)', () => {
        const { ctx, coloring } = makeFixture()
        expect(services.copyPaintEntries(ctx, { ...TARGET, idxs: [2, 0, 2, 9, -1] }).ok)
            .toBe(true)
        expect(coloring.getSelAt.mock.calls.map((c) => c[0])).toEqual([0, 2])
    })

    it('returns nothing to copy for an empty selection', () => {
        const { ctx } = makeFixture()
        expect(services.copyPaintEntries(ctx, { ...TARGET, idxs: [] }))
            .toEqual({ ok: false, entries: [] })
    })

    it('refuses when the target has no PaintColoring', () => {
        const { ctx } = makeFixture({ coloringClass: 'CPKColoring' })
        expect(services.copyPaintEntries(ctx, { ...TARGET, idxs: [0] }))
            .toEqual({ ok: false, entries: [] })
    })
})

describe('cutPaintEntries', () => {
    it('returns the rows then deletes descending under a single undo txn', () => {
        const { ctx, list, removeAt, startUndoTxn, commitUndoTxn } = makeFixture()
        expect(services.cutPaintEntries(ctx, { ...TARGET, idxs: [0, 2] }))
            .toEqual({
                ok: true,
                entries: [
                    { selStr: 'A', colorValue: '#f00' },
                    { selStr: 'C', colorValue: '#00f' },
                ],
            })
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

    it('deletes nothing when the read half finds no rows', () => {
        const { ctx, removeAt, startUndoTxn } = makeFixture()
        expect(services.cutPaintEntries(ctx, { ...TARGET, idxs: [7] }))
            .toEqual({ ok: false, entries: [] })
        expect(removeAt).not.toHaveBeenCalled()
        expect(startUndoTxn).not.toHaveBeenCalled()
    })
})

describe('removePaintEntries', () => {
    it('deletes every selected row descending under a single undo txn', () => {
        const { ctx, list, removeAt, startUndoTxn, commitUndoTxn } = makeFixture()
        expect(services.removePaintEntries(ctx, { ...TARGET, idxs: [0, 2] }))
            .toEqual({ ok: true })
        // Descending, so removing 0 first cannot shift 2 out from under us
        // (UXP `_deletePaintEntriesImpl` sorts the same way).
        expect(removeAt.mock.calls.map((c) => c[0])).toEqual([2, 0])
        expect(list.map(selOf)).toEqual(['B'])
        expect(startUndoTxn).toHaveBeenCalledExactlyOnceWith('Delete paint entry')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('deleting one row is just the one-element case', () => {
        const { ctx, list, removeAt } = makeFixture()
        expect(services.removePaintEntries(ctx, { ...TARGET, idxs: [1] }))
            .toEqual({ ok: true })
        expect(removeAt.mock.calls.map((c) => c[0])).toEqual([1])
        expect(list.map(selOf)).toEqual(['A', 'C'])
    })

    it('materializes a style-default coloring before deleting', () => {
        const { ctx, setColoring, coloring } = makeFixture({ propDefault: true })
        services.removePaintEntries(ctx, { ...TARGET, idxs: [1] })
        expect(setColoring).toHaveBeenCalledWith(coloring)
    })

    it('opens no transaction when no index is in range', () => {
        const { ctx, removeAt, startUndoTxn } = makeFixture()
        expect(services.removePaintEntries(ctx, { ...TARGET, idxs: [7] }))
            .toEqual({ ok: false })
        expect(removeAt).not.toHaveBeenCalled()
        expect(startUndoTxn).not.toHaveBeenCalled()
    })
})

describe('pastePaintEntries', () => {
    /** Copy from one fixture and paste into another, as the clipboard does. */
    function copiedFrom(f: ReturnType<typeof makeFixture>, idxs: number[]) {
        return services.copyPaintEntries(f.ctx, { ...TARGET, idxs }).entries
    }

    it('recompiles the stored strings against the destination scene', () => {
        const entries = copiedFrom(makeFixture(), [0])

        // A different renderer in a different scene: paste must not reuse
        // the source wrappers, it must compile "A" / "#f00" afresh. This is
        // what makes a payload from another scene -- or another CueMol
        // process -- usable at all.
        const dst = makeFixture({ rows: [] })
        expect(dst.compileColor).not.toHaveBeenCalled()
        expect(services.pastePaintEntries(dst.ctx, { ...TARGET, idx: null, entries }))
            .toEqual({ ok: true, count: 1, startIdx: 0 })
        expect(dst.compileColor).toHaveBeenCalledWith('#f00', 7)
        expect(dst.append).toHaveBeenCalledTimes(1)
        expect(dst.append.mock.calls[0][0]).toMatchObject({ compiled: 'A' })
    })

    it('appends at the end when no row is selected', () => {
        const f = makeFixture()
        const entries = copiedFrom(f, [0, 1])
        expect(services.pastePaintEntries(f.ctx, { ...TARGET, idx: null, entries }))
            .toEqual({ ok: true, count: 2, startIdx: 3 })
        expect(f.list).toHaveLength(5)
    })

    it('inserts before the selected row, keeping clipboard order', () => {
        const { ctx, list, insertBefore } = makeFixture()
        const entries = services.copyPaintEntries(ctx, { ...TARGET, idxs: [0, 1] }).entries
        expect(services.pastePaintEntries(ctx, { ...TARGET, idx: 2, entries }))
            .toEqual({ ok: true, count: 2, startIdx: 2 })
        // Inserted at a fixed index in reverse, so A precedes B on the list.
        expect(insertBefore.mock.calls.map((c) => c[0])).toEqual([2, 2])
        expect(list.map(selOf)).toEqual(['A', 'B', 'A', 'B', 'C'])
    })

    it('skips rows whose selection no longer compiles', () => {
        // A selection naming something the destination scene does not have
        // -- the common case when the payload came from elsewhere. UXP
        // drops the row and pastes the rest; so do we.
        const entries = copiedFrom(makeFixture(), [0, 1])
        const dst = makeFixture({ rows: [], badSels: ['A'] })
        expect(services.pastePaintEntries(dst.ctx, { ...TARGET, idx: null, entries }))
            .toEqual({ ok: true, count: 1, startIdx: 0 })
        expect(dst.append).toHaveBeenCalledTimes(1)
    })

    it('is a no-op when handed no rows', () => {
        const { ctx, startUndoTxn, append } = makeFixture()
        expect(services.pastePaintEntries(ctx, { ...TARGET, idx: null, entries: [] }))
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

describe('statelessness', () => {
    // The services keep no clipboard of their own -- the OS clipboard is
    // the only state -- so a copy is invisible to a later paste that was
    // not handed the rows.
    it('a copy leaves nothing behind for a paste to find', () => {
        const { ctx, append, startUndoTxn } = makeFixture()
        services.copyPaintEntries(ctx, { ...TARGET, idxs: [0, 1] })
        expect(services.pastePaintEntries(ctx, { ...TARGET, idx: null, entries: [] }).ok)
            .toBe(false)
        expect(append).not.toHaveBeenCalled()
        expect(startUndoTxn).not.toHaveBeenCalled()
    })
})
