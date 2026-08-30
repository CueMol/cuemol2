import { describe, it, expect, vi } from 'vitest'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn((_ctx: unknown, selStr: string) =>
        selStr === null || selStr === undefined ? null : { __sel: selStr },
    ),
}))

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
        expect(startUndoTxn).toHaveBeenCalledWith(expectedLabel)
        expect(setSel).toHaveBeenCalledWith({ __sel: expectedSel })
    })

    it('unselect sends empty selStr', () => {
        const { ctx, setSel, startUndoTxn } = makeMolCtx({ prevSelStr: 'protein' })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'unselect' })
        expect(startUndoTxn).toHaveBeenCalledWith('Unselect molecule')
        expect(setSel).toHaveBeenCalledWith({ __sel: '' })
    })

    it('invert wraps non-negated input in !(...)', () => {
        const { ctx, setSel } = makeMolCtx({ prevSelStr: 'protein' })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'invert' })
        expect(setSel).toHaveBeenCalledWith({ __sel: '!(protein)' })
    })

    it('invert unwraps !(...) input', () => {
        const { ctx, setSel } = makeMolCtx({ prevSelStr: '!(protein)' })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'invert' })
        expect(setSel).toHaveBeenCalledWith({ __sel: 'protein' })
    })

    it('invert from empty selection selects all', () => {
        const { ctx, setSel } = makeMolCtx({ prevSelStr: '' })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'invert' })
        expect(setSel).toHaveBeenCalledWith({ __sel: '*' })
    })

    it('sidechain toggle prepends bysidech when absent', () => {
        const { ctx, setSel } = makeMolCtx({ prevSelStr: 'aid 1' })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'sidechain' })
        expect(setSel).toHaveBeenCalledWith({ __sel: 'bysidech aid 1' })
    })

    it('sidechain toggle strips bysidech when present', () => {
        const { ctx, setSel } = makeMolCtx({ prevSelStr: 'bysidech aid 1' })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'sidechain' })
        expect(setSel).toHaveBeenCalledWith({ __sel: 'aid 1' })
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

    // Around-selection kinds (UXP `ws.aroundMolSel` / `molSelAround`).
    // The same selstr-rewrite logic is exercised in detail by the navi
    // viewport context-menu tests; this block pins the SelectMolKind
    // dispatch + empty-prev no-op behaviour for the scene-tree object
    // ctxmenu path.
    it.each([
        ['around3', 'aid 1', 'aid 1 around 3'],
        ['around5', 'aid 1', 'aid 1 around 5'],
        ['around7', 'aid 1', 'aid 1 around 7'],
        ['around10', 'aid 1', 'aid 1 around 10'],
        ['aroundByres3', 'aid 1', 'byres aid 1 around 3'],
        ['aroundByres5', 'protein', 'byres protein around 5'],
        ['aroundByres7', 'aid 1', 'byres aid 1 around 7'],
    ] as const)(
        'around kind %s wraps prev=%s into %s with "Around mol selection" txn',
        (kind, prev, expected) => {
            const { ctx, setSel, startUndoTxn } = makeMolCtx({ prevSelStr: prev })
            const res = services.selectObjectMol(ctx, {
                sceneId: 1, objId: 10, kind,
            })
            expect(res.ok).toBe(true)
            expect(startUndoTxn).toHaveBeenCalledWith('Around mol selection')
            expect(setSel).toHaveBeenCalledWith({ __sel: expected })
        },
    )

    it('around5 strips an existing "X around N" wrapper and replaces dist', () => {
        const { ctx, setSel } = makeMolCtx({ prevSelStr: 'aid 1 around 3' })
        services.selectObjectMol(ctx, { sceneId: 1, objId: 10, kind: 'around5' })
        expect(setSel).toHaveBeenCalledWith({ __sel: 'aid 1 around 5' })
    })

    it('aroundByres3 lifts inner sel from "byres (X around N)" form', () => {
        const { ctx, setSel } = makeMolCtx({ prevSelStr: 'byres ( aid 1 around 5 )' })
        services.selectObjectMol(ctx, {
            sceneId: 1, objId: 10, kind: 'aroundByres3',
        })
        expect(setSel).toHaveBeenCalledWith({ __sel: 'byres aid 1 around 3' })
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
