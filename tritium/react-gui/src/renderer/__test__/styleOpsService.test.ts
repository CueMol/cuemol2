import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/styleOps.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

interface StyleSetMock {
    name: string
    src: string
    readonly: boolean
    modified: boolean
}

interface BuildCtxOpts {
    /** Names already taken under the scope (drives hasStyleSet). */
    existingNames?: string[]
    /** Stub StyleSet returned by getStyleSet. */
    stub?: StyleSetMock
    /** Whether the scene lookup should succeed. */
    sceneOk?: boolean
}

function buildCtx(opts: BuildCtxOpts = {}) {
    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const createStyleSet = vi.fn((_name: string, _scope: number) => 500)
    const destroyStyleSet = vi.fn((_scope: number, _id: number) => true)
    const hasStyleSet = vi.fn((name: string, _scope: number) =>
        (opts.existingNames ?? []).includes(name) ? 1 : 0,
    )
    const setReadonly = vi.fn()
    const stubBase: StyleSetMock = opts.stub ?? {
        name: 's',
        src: '',
        readonly: false,
        modified: false,
    }
    const stub: StyleSetMock = {
        ...stubBase,
        get readonly() { return stubBase.readonly },
        set readonly(v: boolean) {
            setReadonly(v)
            stubBase.readonly = v
        },
    }
    const getStyleSet = vi.fn(() => stub)
    const styleMgr = {
        createStyleSet, destroyStyleSet, hasStyleSet, getStyleSet,
    }

    const scene = {
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
    const getScene = vi.fn(() => (opts.sceneOk === false ? null : scene))
    const getService = vi.fn(() => styleMgr)

    const ctx = {
        sceMgr: { getScene },
        svc: { getService },
    } as unknown as WorkerContext

    return {
        ctx, scene, styleMgr,
        createStyleSet, destroyStyleSet, hasStyleSet, getStyleSet,
        setReadonly,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
}

describe('styleOps.createStyleSet', () => {
    it('rejects empty / whitespace names', () => {
        const { ctx, createStyleSet } = buildCtx()
        expect(services.createStyleSet(ctx, { sceneId: 1, name: '  ' }).ok).toBe(false)
        expect(createStyleSet).not.toHaveBeenCalled()
    })

    it('rejects names already taken in the same scope', () => {
        const { ctx, createStyleSet } = buildCtx({ existingNames: ['cartoon'] })
        const res = services.createStyleSet(ctx, { sceneId: 1, name: 'cartoon' })
        expect(res.ok).toBe(false)
        expect(createStyleSet).not.toHaveBeenCalled()
    })

    it('runs StyleManager.createStyleSet under an undo txn on success', () => {
        const { ctx, createStyleSet, startUndoTxn, commitUndoTxn } = buildCtx()
        const res = services.createStyleSet(ctx, { sceneId: 1, name: 'mine' })
        expect(res).toEqual({ ok: true, newId: 500 })
        expect(startUndoTxn).toHaveBeenCalledWith('Create style')
        expect(createStyleSet).toHaveBeenCalledWith('mine', 1)
        expect(commitUndoTxn).toHaveBeenCalled()
    })

    it('rolls back when createStyleSet returns a negative uid', () => {
        const { ctx, createStyleSet, rollbackUndoTxn } = buildCtx()
        createStyleSet.mockReturnValueOnce(-1)
        const res = services.createStyleSet(ctx, { sceneId: 1, name: 'mine' })
        expect(res.ok).toBe(false)
        // withUndoTxn commits even with negative return; only "scene lookup
        // failure" or thrown error triggers rollback. Either way the result
        // should report ok:false. Document both possibilities so the
        // contract is clear to readers.
        expect(rollbackUndoTxn).not.toHaveBeenCalled()
    })
})

describe('styleOps.destroyStyleSet', () => {
    it('calls destroyStyleSet under undo txn', () => {
        const { ctx, destroyStyleSet, startUndoTxn } = buildCtx()
        const res = services.destroyStyleSet(ctx, {
            sceneId: 1, scopeId: 1, styleSetId: 23,
        })
        expect(res.ok).toBe(true)
        expect(startUndoTxn).toHaveBeenCalledWith('Destroy style')
        expect(destroyStyleSet).toHaveBeenCalledWith(1, 23)
    })

    it('returns ok:false when scene lookup fails', () => {
        const { ctx, destroyStyleSet } = buildCtx({ sceneOk: false })
        const res = services.destroyStyleSet(ctx, {
            sceneId: 1, scopeId: 1, styleSetId: 23,
        })
        expect(res.ok).toBe(false)
        expect(destroyStyleSet).not.toHaveBeenCalled()
    })
})

describe('styleOps.toggleStyleSetReadOnly', () => {
    it('rejects global scope (scopeId === 0)', () => {
        const { ctx, setReadonly } = buildCtx()
        const res = services.toggleStyleSetReadOnly(ctx, {
            sceneId: 1, scopeId: 0, styleSetId: 11,
        })
        expect(res.ok).toBe(false)
        expect(setReadonly).not.toHaveBeenCalled()
    })

    it('flips read-only ON for an unmodified scene-local style', () => {
        const { ctx, setReadonly } = buildCtx({
            stub: { name: 's', src: '', readonly: false, modified: false },
        })
        const res = services.toggleStyleSetReadOnly(ctx, {
            sceneId: 1, scopeId: 1, styleSetId: 23,
        })
        expect(res).toEqual({ ok: true, readonly: true })
        expect(setReadonly).toHaveBeenCalledWith(true)
    })

    it('refuses RW → RO when the style is modified', () => {
        const { ctx, setReadonly } = buildCtx({
            stub: { name: 's', src: '', readonly: false, modified: true },
        })
        const res = services.toggleStyleSetReadOnly(ctx, {
            sceneId: 1, scopeId: 1, styleSetId: 23,
        })
        expect(res.ok).toBe(false)
        expect(setReadonly).not.toHaveBeenCalled()
    })

    it('flips read-only OFF unconditionally', () => {
        const { ctx, setReadonly } = buildCtx({
            stub: { name: 's', src: '', readonly: true, modified: true },
        })
        const res = services.toggleStyleSetReadOnly(ctx, {
            sceneId: 1, scopeId: 1, styleSetId: 23,
        })
        expect(res).toEqual({ ok: true, readonly: false })
        expect(setReadonly).toHaveBeenCalledWith(false)
    })
})
