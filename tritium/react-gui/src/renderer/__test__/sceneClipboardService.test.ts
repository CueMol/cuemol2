import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    services,
    _resetClipboardForTest,
} from '../worker/server/services/sceneClipboard.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

interface BuildCtxOpts {
    /** Existing object names in the destination scene (for paste uniquification). */
    existingObjectNames?: string[]
    /** Existing renderer names on the target object (for paste uniquification). */
    existingRendererNames?: string[]
    /** Mock object returned by scene.getObject. If omitted, returns the source object. */
    customObject?: unknown
    /** What strMgr.fromXML should return. */
    restored?: unknown
}

function buildCtx(opts: BuildCtxOpts = {}) {
    const sourceObj = {
        uid: 10,
        name: 'mol1',
        className: 'PDBMol',
    }
    const sourceRend = {
        uid: 100,
        name: 'rend1',
        type_name: 'cartoon',
    }
    const addObject = vi.fn(() => 200)
    const attachRenderer = vi.fn()
    const setObjName = vi.fn()
    const setRendName = vi.fn()
    const targetObj = {
        attachRenderer,
        getRendererByName: vi.fn((n: string) =>
            (opts.existingRendererNames ?? []).includes(n) ? { __r: n } : null,
        ),
    }
    const restored = opts.restored ?? {
        get name() { return '' },
        set name(v: string) { setObjName(v) },
        attachRenderer,
    }

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const mockScene = {
        uid: 7,
        getObject: vi.fn((id: number) =>
            opts.customObject !== undefined
                ? opts.customObject
                : id === sourceObj.uid
                  ? sourceObj
                  : id === 999
                    ? targetObj
                    : null,
        ),
        getRenderer: vi.fn(() => sourceRend),
        getObjectByName: vi.fn((n: string) =>
            (opts.existingObjectNames ?? []).includes(n) ? { __o: n } : null,
        ),
        addObject,
        startUndoTxn,
        commitUndoTxn,
        rollbackUndoTxn,
    }

    const toXML = vi.fn(() => ({ __byteArray: true }))
    const fromXML = vi.fn(() => restored)

    const ctx = {
        sceMgr: { getScene: vi.fn(() => mockScene) },
        strMgr: { toXML, fromXML },
    } as unknown as WorkerContext

    return {
        ctx, mockScene, sourceObj, sourceRend, targetObj, restored,
        addObject, attachRenderer, toXML, fromXML,
        setObjName, setRendName,
        startUndoTxn, commitUndoTxn,
    }
}

beforeEach(() => {
    _resetClipboardForTest()
})

describe('sceneClipboard.copyNode', () => {
    it('object copy stores XML + class info and returns kind=object', () => {
        const { ctx, toXML } = buildCtx()
        const res = services.copyNode(ctx, { sceneId: 1, nodeId: 10, nodeType: 'object' })
        expect(res).toEqual({ ok: true, kind: 'object' })
        expect(toXML).toHaveBeenCalledTimes(1)
    })

    it('renderer copy returns kind=renderer (via scene.getRenderer)', () => {
        const { ctx, mockScene, toXML } = buildCtx()
        const res = services.copyNode(ctx, { sceneId: 1, nodeId: 100, nodeType: 'renderer' })
        expect(res).toEqual({ ok: true, kind: 'renderer' })
        expect(mockScene.getRenderer).toHaveBeenCalledWith(100)
        expect(toXML).toHaveBeenCalled()
    })

    it('rendGroup copy is treated as renderer kind', () => {
        const { ctx } = buildCtx()
        const res = services.copyNode(ctx, { sceneId: 1, nodeId: 50, nodeType: 'rendGroup' })
        expect(res.kind).toBe('renderer')
    })

    it('returns ok:false when scene lookup fails', () => {
        const ctx = {
            sceMgr: { getScene: () => null },
            strMgr: { toXML: vi.fn() },
        } as unknown as WorkerContext
        const res = services.copyNode(ctx, { sceneId: 1, nodeId: 10, nodeType: 'object' })
        expect(res).toEqual({ ok: false, kind: null })
    })

    it('returns ok:false when the source object is missing', () => {
        const { ctx, mockScene } = buildCtx()
        mockScene.getObject.mockReturnValue(null)
        const res = services.copyNode(ctx, { sceneId: 1, nodeId: 99, nodeType: 'object' })
        expect(res.ok).toBe(false)
    })
})

describe('sceneClipboard.pasteNode', () => {
    it('returns ok:false when clipboard is empty', () => {
        const { ctx } = buildCtx()
        const res = services.pasteNode(ctx, { sceneId: 1 })
        expect(res.ok).toBe(false)
    })

    it('object paste calls fromXML + scene.addObject under undo txn', () => {
        const { ctx, fromXML, addObject, startUndoTxn, commitUndoTxn } = buildCtx()
        services.copyNode(ctx, { sceneId: 1, nodeId: 10, nodeType: 'object' })
        const res = services.pasteNode(ctx, { sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(res.newId).toBe(200)
        expect(startUndoTxn).toHaveBeenCalledWith('Paste object')
        expect(fromXML).toHaveBeenCalled()
        expect(addObject).toHaveBeenCalledWith(res === null ? null : expect.anything())
        expect(commitUndoTxn).toHaveBeenCalled()
    })

    it('object paste uniquifies the name on conflict (mol1 → mol1_1)', () => {
        const { ctx, setObjName } = buildCtx({ existingObjectNames: ['mol1'] })
        services.copyNode(ctx, { sceneId: 1, nodeId: 10, nodeType: 'object' })
        const res = services.pasteNode(ctx, { sceneId: 1 })
        expect(res.newName).toBe('mol1_1')
        expect(setObjName).toHaveBeenCalledWith('mol1_1')
    })

    it('renderer paste requires targetObjId and calls obj.attachRenderer', () => {
        const setName = vi.fn()
        const restored = {
            get name() { return '' },
            set name(v: string) { setName(v) },
            uid: 555,
        }
        const { ctx, attachRenderer } = buildCtx({ restored })
        services.copyNode(ctx, { sceneId: 1, nodeId: 100, nodeType: 'renderer' })
        const res = services.pasteNode(ctx, { sceneId: 1, targetObjId: 999 })
        expect(res.ok).toBe(true)
        expect(attachRenderer).toHaveBeenCalledWith(restored)
        expect(setName).toHaveBeenCalledWith('rend1')
    })

    it('renderer paste returns ok:false when targetObjId is omitted', () => {
        const { ctx } = buildCtx()
        services.copyNode(ctx, { sceneId: 1, nodeId: 100, nodeType: 'renderer' })
        const res = services.pasteNode(ctx, { sceneId: 1 })
        expect(res.ok).toBe(false)
    })

    it('renderer paste uniquifies the name against existing renderers', () => {
        const setName = vi.fn()
        const restored = {
            get name() { return '' },
            set name(v: string) { setName(v) },
        }
        const { ctx } = buildCtx({
            restored,
            existingRendererNames: ['rend1'],
        })
        services.copyNode(ctx, { sceneId: 1, nodeId: 100, nodeType: 'renderer' })
        const res = services.pasteNode(ctx, { sceneId: 1, targetObjId: 999 })
        expect(res.newName).toBe('rend1_1')
        expect(setName).toHaveBeenCalledWith('rend1_1')
    })
})

describe('sceneClipboard.getClipboardKind', () => {
    it('returns kind:null when clipboard is empty', () => {
        const { ctx } = buildCtx()
        expect(services.getClipboardKind(ctx, {})).toEqual({ kind: null, sourceName: '' })
    })

    it('returns object kind + sourceName after object copy', () => {
        const { ctx } = buildCtx()
        services.copyNode(ctx, { sceneId: 1, nodeId: 10, nodeType: 'object' })
        expect(services.getClipboardKind(ctx, {})).toEqual({ kind: 'object', sourceName: 'mol1' })
    })

    it('returns renderer kind after renderer copy', () => {
        const { ctx } = buildCtx()
        services.copyNode(ctx, { sceneId: 1, nodeId: 100, nodeType: 'renderer' })
        expect(services.getClipboardKind(ctx, {})).toEqual({ kind: 'renderer', sourceName: 'rend1' })
    })

    it('the singleton survives across separate ctx instances (same worker process)', () => {
        const a = buildCtx()
        services.copyNode(a.ctx, { sceneId: 1, nodeId: 10, nodeType: 'object' })
        const b = buildCtx()
        expect(services.getClipboardKind(b.ctx, {}).kind).toBe('object')
    })
})
