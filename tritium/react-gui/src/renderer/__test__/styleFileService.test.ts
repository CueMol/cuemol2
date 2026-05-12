import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/styleFile.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

function buildCtx(opts: {
    sceneOk?: boolean
    loadReturns?: number
    saveReturns?: boolean
    src?: string
} = {}) {
    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const loadStyleSetFromFile = vi.fn(
        (_scope: number, _path: string, _ro: boolean) =>
            opts.loadReturns ?? 42,
    )
    const saveStyleSetToFile = vi.fn(
        (_scope: number, _id: number, _path: string) => opts.saveReturns ?? true,
    )
    const getStyleSetSource = vi.fn((_id: number) => opts.src ?? '')
    const firePendingEvents = vi.fn()
    const mgr = {
        loadStyleSetFromFile,
        saveStyleSetToFile,
        getStyleSetSource,
        firePendingEvents,
    }

    const scene = { startUndoTxn, commitUndoTxn, rollbackUndoTxn }
    const getScene = vi.fn(() => (opts.sceneOk === false ? null : scene))
    const getService = vi.fn(() => mgr)
    const ctx = {
        sceMgr: { getScene },
        svc: { getService },
    } as unknown as WorkerContext

    return {
        ctx, mgr,
        loadStyleSetFromFile, saveStyleSetToFile, getStyleSetSource,
        firePendingEvents,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
}

describe('styleFile.loadStyleSetFromFile', () => {
    it('rejects empty path', () => {
        const { ctx, loadStyleSetFromFile } = buildCtx()
        const res = services.loadStyleSetFromFile(ctx, { sceneId: 1, path: '' })
        expect(res.ok).toBe(false)
        expect(loadStyleSetFromFile).not.toHaveBeenCalled()
    })

    it('always loads as read-only (UXP onStyLoadFile parity)', () => {
        const { ctx, loadStyleSetFromFile, firePendingEvents } = buildCtx()
        const res = services.loadStyleSetFromFile(ctx, {
            sceneId: 1, path: '/path/to/style.xml',
        })
        expect(res).toEqual({ ok: true, newId: 42 })
        expect(loadStyleSetFromFile).toHaveBeenCalledWith(1, '/path/to/style.xml', true)
        expect(firePendingEvents).toHaveBeenCalled()
    })

    it('returns ok:false when C++ returns -1', () => {
        const { ctx } = buildCtx({ loadReturns: -1 })
        const res = services.loadStyleSetFromFile(ctx, {
            sceneId: 1, path: '/path/to/style.xml',
        })
        expect(res).toEqual({ ok: false, newId: -1 })
    })
})

describe('styleFile.saveStyleSetToFile (Save As)', () => {
    it('calls saveStyleSetToFile under "Change style\'s source" txn', () => {
        const { ctx, saveStyleSetToFile, startUndoTxn } = buildCtx()
        const res = services.saveStyleSetToFile(ctx, {
            sceneId: 1, scopeId: 1, styleSetId: 23, path: '/foo.xml',
        })
        expect(res.ok).toBe(true)
        expect(startUndoTxn).toHaveBeenCalledWith("Change style's source")
        expect(saveStyleSetToFile).toHaveBeenCalledWith(1, 23, '/foo.xml')
    })

    it('rejects empty path', () => {
        const { ctx, saveStyleSetToFile } = buildCtx()
        const res = services.saveStyleSetToFile(ctx, {
            sceneId: 1, scopeId: 1, styleSetId: 23, path: '',
        })
        expect(res.ok).toBe(false)
        expect(saveStyleSetToFile).not.toHaveBeenCalled()
    })
})

describe('styleFile.saveStyleSetToCurrentSrc', () => {
    it('returns ok:true,saved:false when there is no src (caller falls back to Save As)', () => {
        const { ctx, saveStyleSetToFile } = buildCtx({ src: '' })
        const res = services.saveStyleSetToCurrentSrc(ctx, {
            sceneId: 1, scopeId: 1, styleSetId: 23,
        })
        expect(res).toEqual({ ok: true, saved: false })
        expect(saveStyleSetToFile).not.toHaveBeenCalled()
    })

    it('writes to the existing src when present', () => {
        const { ctx, saveStyleSetToFile, startUndoTxn } = buildCtx({
            src: '/x/existing.xml',
        })
        const res = services.saveStyleSetToCurrentSrc(ctx, {
            sceneId: 1, scopeId: 1, styleSetId: 23,
        })
        expect(res).toEqual({ ok: true, saved: true })
        expect(startUndoTxn).toHaveBeenCalledWith('Save style file')
        expect(saveStyleSetToFile).toHaveBeenCalledWith(1, 23, '/x/existing.xml')
    })

    it('reports ok:false when the C++ save returns false', () => {
        const { ctx } = buildCtx({ src: '/x/existing.xml', saveReturns: false })
        const res = services.saveStyleSetToCurrentSrc(ctx, {
            sceneId: 1, scopeId: 1, styleSetId: 23,
        })
        expect(res).toEqual({ ok: false, saved: false })
    })
})
