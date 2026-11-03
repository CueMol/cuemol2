import { describe, it, expect, vi } from 'vitest'

// The rewriting itself is C++ SelCommand's (pinned by the gtest
// test_sel_simplify.cpp); here each method only reports how it was called.
// Methods live on the prototype, so `toHaveBeenCalledWith({ __sel })` still
// compares the compiled string alone.
vi.mock('@renderer/worker/server/services/helpers/makeSel', () => {
    class FakeSel {
        constructor(public __sel: string) {}
        invertSimplified(): string { return `invert(${this.__sel})` }
        toggleSidechain(): string { return `side(${this.__sel})` }
        rewriteAround(dist: number, byres: boolean): string { return `around(${this.__sel},${dist},${byres})` }
        simplify(): string { return this.__sel }
    }
    return {
        makeSel: vi.fn((_ctx: unknown, selStr: string) =>
            selStr === null || selStr === undefined ? null : new FakeSel(selStr),
        ),
    }
})

import { services } from '@renderer/worker/server/services/select/select.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

describe('selectObjectMol service', () => {
    function makeMolCtx(opts: {
        prevSelStr?: string
        hasSelRend?: boolean
    } = {}) {
        const setSel = vi.fn()
        const createRenderer = vi.fn()
        const getRendererByType = vi.fn(() =>
            opts.hasSelRend ? { __selRend: true } : null,
        )
        const mol = {
            get sel() {
                return opts.prevSelStr === undefined
                    ? null
                    : { toString: () => opts.prevSelStr! }
            },
            set sel(v: unknown) { setSel(v) },
            getRendererByType,
            createRenderer,
        }
        const startUndoTxn = vi.fn()
        const commitUndoTxn = vi.fn()
        const rollbackUndoTxn = vi.fn()
        const mockScene = {
            uid: 7,
            getObject: vi.fn(() => mol),
            startUndoTxn,
            commitUndoTxn,
            rollbackUndoTxn,
        }
        const ctx = {
            sceMgr: { getScene: vi.fn(() => mockScene) },
        } as unknown as WorkerContext
        return {
            ctx, mockScene, mol,
            setSel, createRenderer, getRendererByType,
            startUndoTxn, commitUndoTxn,
        }
    }

    it.each([
        ['all', '*', 'Select all atoms'],
        ['protein', 'protein', 'Select protein'],
        ['nucleic', 'nucleic', 'Select nucleic'],
        ['water', 'water', 'Select water'],
        ['sugar', 'sugar', 'Select sugar'],
        ['hydrogen', 'elem H', 'Select hydrogen'],
    ] as const)('maps %s to selStr=%s with undo label %s', (kind, expectedSel, expectedLabel) => {
        const { ctx, setSel, startUndoTxn } = makeMolCtx()
        const res = services.selectObjectMol(ctx, {
            sceneId: 1, objId: 10, kind,
        })
        expect(res.ok).toBe(true)
        expect(res.selStr).toBe(expectedSel)
        expect(startUndoTxn).toHaveBeenCalledWith(expectedLabel)
        expect(setSel).toHaveBeenCalledWith({ __sel: expectedSel })
    })

    it('unselect sends empty selStr', () => {
        const { ctx, setSel, startUndoTxn } = makeMolCtx({ prevSelStr: 'protein' })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'unselect' })
        expect(startUndoTxn).toHaveBeenCalledWith('Unselect molecule')
        expect(setSel).toHaveBeenCalledWith({ __sel: '' })
    })

    it('invert, sidechain and around go to the C++ edits on the current selection', () => {
        const run = (kind: 'invert' | 'sidechain' | 'around5' | 'aroundByres7') => {
            const { ctx, setSel } = makeMolCtx({ prevSelStr: 'aid 1' })
            services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind })
            return setSel.mock.calls[0][0]
        }
        expect(run('invert')).toEqual({ __sel: 'invert(aid 1)' })
        expect(run('sidechain')).toEqual({ __sel: 'side(aid 1)' })
        expect(run('around5')).toEqual({ __sel: 'around(aid 1,5,false)' })
        expect(run('aroundByres7')).toEqual({ __sel: 'around(aid 1,7,true)' })
    })

    it('invert from empty selection selects all', () => {
        const { ctx, setSel } = makeMolCtx({ prevSelStr: '' })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'invert' })
        expect(setSel).toHaveBeenCalledWith({ __sel: '*' })
    })

    it('sidechain toggle is a no-op when selection is empty', () => {
        const { ctx, setSel, startUndoTxn } = makeMolCtx({ prevSelStr: '' })
        const res = services.selectObjectMol(ctx, {
            sceneId: 1, objId: 10, kind: 'sidechain',
        })
        expect(res.ok).toBe(false)
        expect(startUndoTxn).not.toHaveBeenCalled()
        expect(setSel).not.toHaveBeenCalled()
    })

    it.each([
        ['around5'], ['aroundByres5'],
    ] as const)('%s is a no-op when selection is empty', (kind) => {
        const { ctx, setSel, startUndoTxn } = makeMolCtx({ prevSelStr: '' })
        const res = services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind })
        expect(res.ok).toBe(false)
        expect(startUndoTxn).not.toHaveBeenCalled()
        expect(setSel).not.toHaveBeenCalled()
    })

    it('auto-creates *selection renderer when missing', () => {
        const { ctx, createRenderer } = makeMolCtx({ hasSelRend: false })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'all' })
        expect(createRenderer).toHaveBeenCalledWith('*selection')
    })

    it('skips renderer creation when *selection already exists', () => {
        const { ctx, createRenderer } = makeMolCtx({ hasSelRend: true })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'all' })
        expect(createRenderer).not.toHaveBeenCalled()
    })

    it('returns ok:false when scene missing', () => {
        const ctx = {
            sceMgr: { getScene: () => null },
        } as unknown as WorkerContext
        const res = services.selectObjectMol(ctx, {
            sceneId: 1, objId: 10, kind: 'all',
        })
        expect(res.ok).toBe(false)
    })
})
