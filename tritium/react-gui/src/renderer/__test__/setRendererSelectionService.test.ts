import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn((_ctx: unknown, selStr: string, _uid?: number) =>
        selStr ? { __sel: selStr } : null,
    ),
}))

import { services } from '@renderer/worker/server/services/rend/rend.service'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { ChangeRendSelKind } from '@shared/types/sceneCtxMenu'

interface FixtureOpts {
    /** When false, scene lookup returns null. */
    sceneExists?: boolean
    /** When false, scene.getRenderer returns null. */
    rendExists?: boolean
    /** When false, rend.getClientObj() returns null. */
    molExists?: boolean
    /** When false, the renderer object lacks a sel prop. */
    rendHasSelProp?: boolean
    /** When false, the mol lacks a sel prop. */
    molHasSelProp?: boolean
    /** Value returned by mol.sel for the 'current' branch. */
    molCurrentSel?: unknown
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        sceneExists = true,
        rendExists = true,
        molExists = true,
        rendHasSelProp = true,
        molHasSelProp = true,
        molCurrentSel = { __sel: '__mol_current__' },
    } = opts

    const setRendSel = vi.fn()
    const rend: Record<string, unknown> = {
        getClientObj: vi.fn(() => mol),
    }
    if (rendHasSelProp) {
        Object.defineProperty(rend, 'sel', {
            get: () => undefined,
            set: (v: unknown) => setRendSel(v),
            enumerable: true,
            configurable: true,
        })
    }

    const mol: Record<string, unknown> | null = molExists ? {} : null
    if (mol && molHasSelProp) {
        Object.defineProperty(mol, 'sel', {
            get: () => molCurrentSel,
            enumerable: true,
            configurable: true,
        })
    }

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const scene = {
        uid: 7,
        getRenderer: vi.fn(() => (rendExists ? rend : null)),
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
    } as unknown as WorkerContext

    return { ctx, scene, rend, mol, setRendSel, startUndoTxn, commitUndoTxn }
}

const baseArgs = (selKind: ChangeRendSelKind) => ({
    sceneId: 1, rendId: 100, selKind,
})

describe('setRendererSelection — "current" branch', () => {
    beforeEach(() => vi.clearAllMocks())

    it("'current' assigns mol.sel directly (no makeSel call)", () => {
        const { ctx, setRendSel } = makeFixture({
            molCurrentSel: { __sel: '__mol_current__', toString: () => "c;'A'" },
        })
        const res = services.setRendererSelection(ctx, baseArgs('current'))
        // selStr is the mol selection's string form, for the selection history.
        expect(res).toEqual({ ok: true, selStr: "c;'A'" })
        expect(setRendSel).toHaveBeenCalledWith(expect.objectContaining({ __sel: '__mol_current__' }))
        expect(makeSel).not.toHaveBeenCalled()
    })

    it("returns ok:false when 'current' but mol.sel is null", () => {
        const { ctx, setRendSel } = makeFixture({ molCurrentSel: null })
        const res = services.setRendererSelection(ctx, baseArgs('current'))
        expect(res).toEqual({ ok: false })
        expect(setRendSel).not.toHaveBeenCalled()
    })
})

describe('setRendererSelection — canned predicates', () => {
    beforeEach(() => vi.clearAllMocks())

    const expectations: Array<[ChangeRendSelKind, string]> = [
        ['all', '*'],
        ['protein', 'protein'],
        ['nucleic', 'nucleic'],
        ['water', 'water'],
        ['ligand', '!protein & !nucleic & !water'],
        ['sugar', 'sugar'],
    ]

    for (const [kind, expected] of expectations) {
        it(`'${kind}' compiles via makeSel with "${expected}"`, () => {
            const { ctx, setRendSel } = makeFixture()
            const res = services.setRendererSelection(ctx, baseArgs(kind))
            expect(res).toEqual({ ok: true, selStr: expected })
            expect(makeSel).toHaveBeenCalledWith(ctx, expected, 7)
            expect(setRendSel).toHaveBeenCalledWith({ __sel: expected })
        })
    }

    it('wraps assignment in "Set renderer sel" undo txn', () => {
        const { ctx, startUndoTxn, commitUndoTxn } = makeFixture()
        services.setRendererSelection(ctx, baseArgs('protein'))
        expect(startUndoTxn).toHaveBeenCalledWith('Set renderer sel')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })
})

describe('setRendererSelection — failure modes', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns ok:false when scene lookup fails', () => {
        const { ctx } = makeFixture({ sceneExists: false })
        expect(services.setRendererSelection(ctx, baseArgs('all')))
            .toEqual({ ok: false })
    })

    it('returns ok:false when renderer lookup fails', () => {
        const { ctx } = makeFixture({ rendExists: false })
        expect(services.setRendererSelection(ctx, baseArgs('all')))
            .toEqual({ ok: false })
    })

    it('returns ok:false when parent mol cannot be resolved', () => {
        const { ctx } = makeFixture({ molExists: false })
        expect(services.setRendererSelection(ctx, baseArgs('all')))
            .toEqual({ ok: false })
    })

    it('returns ok:false when the renderer lacks a sel property', () => {
        const { ctx, setRendSel } = makeFixture({ rendHasSelProp: false })
        expect(services.setRendererSelection(ctx, baseArgs('all')))
            .toEqual({ ok: false })
        expect(setRendSel).not.toHaveBeenCalled()
    })

    it('returns ok:false when the mol lacks a sel property', () => {
        const { ctx, setRendSel } = makeFixture({ molHasSelProp: false })
        expect(services.setRendererSelection(ctx, baseArgs('all')))
            .toEqual({ ok: false })
        expect(setRendSel).not.toHaveBeenCalled()
    })
})
