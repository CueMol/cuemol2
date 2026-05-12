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

function buildCtx(opts: BuildCtxOpts & {
    /** Stub StyleSet for nodeId 700 (source). Only used by style tests. */
    sourceStyleSet?: { name: string }
    /** Restored StyleSet for paste tests. */
    restoredStyle?: unknown
    /** Style names that already exist in the destination scope. */
    existingStyleNames?: string[]
    /** What registerStyleSet should return. */
    registerOk?: boolean
} = {}) {
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
    // rendgroup paste target: a group renderer (uid=888) whose
    // getClientObj returns the same parent mol used by object paste.
    const targetGroup = {
        name: 'grpA',
        getClientObj: vi.fn(() => targetObj),
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
        getRenderer: vi.fn((id?: number) =>
            id === 888 ? targetGroup : sourceRend,
        ),
        getObjectByName: vi.fn((n: string) =>
            (opts.existingObjectNames ?? []).includes(n) ? { __o: n } : null,
        ),
        addObject,
        startUndoTxn,
        commitUndoTxn,
        rollbackUndoTxn,
    }

    const toXML = vi.fn(() => ({ __byteArray: true }))
    // Default fromXML returns the object/renderer restored fixture; style
    // tests override per-call via the `restoredStyle` arg below.
    const fromXML = vi.fn((_: unknown) => restored)

    // StyleManager mock used by both copyNode and pasteNode style branches.
    const sourceStyleSet = opts.sourceStyleSet ?? { name: 'mystyle' }
    const getStyleSet = vi.fn((id: number) =>
        id === 700 ? sourceStyleSet : null,
    )
    const hasStyleSet = vi.fn((n: string, _scope: number) =>
        (opts.existingStyleNames ?? []).includes(n) ? 1 : 0,
    )
    const destroyStyleSet = vi.fn(() => true)
    const registerStyleSet = vi.fn(() => opts.registerOk ?? true)
    const styleMgr = {
        getStyleSet, hasStyleSet, destroyStyleSet, registerStyleSet,
    }
    const getService = vi.fn(() => styleMgr)

    const ctx = {
        sceMgr: { getScene: vi.fn(() => mockScene) },
        strMgr: { toXML, fromXML },
        svc: { getService },
    } as unknown as WorkerContext

    return {
        ctx, mockScene, sourceObj, sourceRend, targetObj, targetGroup, restored,
        addObject, attachRenderer, toXML, fromXML,
        setObjName, setRendName,
        startUndoTxn, commitUndoTxn,
        styleMgr, sourceStyleSet,
        getStyleSet, hasStyleSet, registerStyleSet,
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

    it('renderer paste onto an object clears rend.group (no group inherit)', () => {
        const setGroup = vi.fn()
        const restored = {
            get name() { return '' },
            set name(_v: string) {},
            set group(v: string) { setGroup(v) },
            get group() { return '' },
        }
        const { ctx } = buildCtx({ restored })
        services.copyNode(ctx, { sceneId: 1, nodeId: 100, nodeType: 'renderer' })
        services.pasteNode(ctx, { sceneId: 1, targetObjId: 999 })
        expect(setGroup).toHaveBeenCalledWith('')
    })

    it('targetGroupId path resolves parent mol, sets rend.group to group name, and attaches', () => {
        const setGroup = vi.fn()
        const restored = {
            get name() { return '' },
            set name(_v: string) {},
            set group(v: string) { setGroup(v) },
            get group() { return '' },
        }
        const { ctx, targetGroup, targetObj, attachRenderer, startUndoTxn } = buildCtx({
            restored,
        })
        services.copyNode(ctx, { sceneId: 1, nodeId: 100, nodeType: 'renderer' })
        const res = services.pasteNode(ctx, { sceneId: 1, targetGroupId: 888 })
        expect(res.ok).toBe(true)
        expect(targetGroup.getClientObj).toHaveBeenCalled()
        expect(setGroup).toHaveBeenCalledWith('grpA')
        expect(attachRenderer).toHaveBeenCalledWith(restored)
        expect(startUndoTxn).toHaveBeenCalledWith('Paste renderer into group')
        // Sanity: name uniquification still goes through the group's parent obj.
        expect(targetObj.getRendererByName).toHaveBeenCalledWith('rend1')
    })

    it('targetGroupId paste uniquifies name against the parent mol\'s existing renderers', () => {
        const setName = vi.fn()
        const restored = {
            get name() { return '' },
            set name(v: string) { setName(v) },
            set group(_v: string) {},
            get group() { return '' },
        }
        const { ctx } = buildCtx({
            restored,
            existingRendererNames: ['rend1'],
        })
        services.copyNode(ctx, { sceneId: 1, nodeId: 100, nodeType: 'renderer' })
        const res = services.pasteNode(ctx, { sceneId: 1, targetGroupId: 888 })
        expect(res.newName).toBe('rend1_1')
        expect(setName).toHaveBeenCalledWith('rend1_1')
    })

    it('targetGroupId returns ok:false when the group has no resolvable client mol', () => {
        const { ctx, targetGroup } = buildCtx()
        targetGroup.getClientObj.mockReturnValueOnce(null as unknown as never)
        services.copyNode(ctx, { sceneId: 1, nodeId: 100, nodeType: 'renderer' })
        const res = services.pasteNode(ctx, { sceneId: 1, targetGroupId: 888 })
        expect(res.ok).toBe(false)
    })
})

describe('sceneClipboard camera branch (Phase 5b)', () => {
    function buildCameraCtx(opts: { existingNames?: string[] } = {}) {
        const setCamera = vi.fn()
        const hasCamera = vi.fn((n: string) =>
            (opts.existingNames ?? []).includes(n),
        )
        const sourceCam = { name: 'cam0', uid: 555 }
        const getCameraRef = vi.fn((n: string) =>
            n === 'cam0' ? sourceCam : null,
        )
        const startUndoTxn = vi.fn()
        const commitUndoTxn = vi.fn()
        const rollbackUndoTxn = vi.fn()
        const scene = {
            uid: 7,
            getObject: vi.fn(),
            getRenderer: vi.fn(),
            getObjectByName: vi.fn(),
            addObject: vi.fn(),
            getCameraRef, setCamera, hasCamera,
            startUndoTxn, commitUndoTxn, rollbackUndoTxn,
        }
        const toXML = vi.fn(() => ({ __byteArray: true }))
        const setRestoredName = vi.fn()
        const restoredCam = {
            get name() { return 'cam0' },
            set name(v: string) { setRestoredName(v) },
            notifyLoaded: vi.fn(),
        }
        const fromXML = vi.fn(() => restoredCam)
        const ctx = {
            sceMgr: { getScene: vi.fn(() => scene) },
            strMgr: { toXML, fromXML },
            svc: { getService: vi.fn(() => null) },
        } as unknown as WorkerContext
        return {
            ctx, scene, sourceCam, restoredCam,
            getCameraRef, hasCamera, setCamera, toXML, fromXML,
            startUndoTxn, commitUndoTxn,
        }
    }

    it('camera copy requires cameraName and calls strMgr.toXML on the cam ref', () => {
        const { ctx, toXML, getCameraRef } = buildCameraCtx()
        const noName = services.copyNode(ctx, {
            sceneId: 1, nodeId: -1000, nodeType: 'camera',
        })
        expect(noName).toEqual({ ok: false, kind: null })
        expect(toXML).not.toHaveBeenCalled()

        const ok = services.copyNode(ctx, {
            sceneId: 1, nodeId: -1000, nodeType: 'camera', cameraName: 'cam0',
        })
        expect(ok).toEqual({ ok: true, kind: 'camera' })
        expect(getCameraRef).toHaveBeenCalledWith('cam0')
        expect(toXML).toHaveBeenCalled()
    })

    it('camera paste calls scene.setCamera + notifyLoaded under "Paste camera" txn', () => {
        const { ctx, setCamera, restoredCam, startUndoTxn } = buildCameraCtx()
        services.copyNode(ctx, {
            sceneId: 1, nodeId: -1000, nodeType: 'camera', cameraName: 'cam0',
        })
        const res = services.pasteNode(ctx, { sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(res.newName).toBe('cam0')
        expect(startUndoTxn).toHaveBeenCalledWith('Paste camera')
        expect(setCamera).toHaveBeenCalledWith('cam0', restoredCam)
        expect(restoredCam.notifyLoaded).toHaveBeenCalled()
    })

    it('camera paste uniquifies on name collision via copy{i}_<orig>', () => {
        const { ctx, setCamera } = buildCameraCtx({ existingNames: ['cam0'] })
        services.copyNode(ctx, {
            sceneId: 1, nodeId: -1000, nodeType: 'camera', cameraName: 'cam0',
        })
        const res = services.pasteNode(ctx, { sceneId: 1 })
        expect(res.newName).toBe('copy1_cam0')
        expect(setCamera).toHaveBeenCalledWith('copy1_cam0', expect.anything())
    })

    it('getClipboardKind returns "camera" after a camera copy', () => {
        const { ctx } = buildCameraCtx()
        services.copyNode(ctx, {
            sceneId: 1, nodeId: -1000, nodeType: 'camera', cameraName: 'cam0',
        })
        expect(services.getClipboardKind(ctx, {}).kind).toBe('camera')
    })
})

describe('sceneClipboard style branch (Phase 5c)', () => {
    it('rejects style copy on global scope (scopeId === 0)', () => {
        const { ctx, toXML } = buildCtx()
        const res = services.copyNode(ctx, {
            sceneId: 1, nodeId: 700, nodeType: 'style', scopeId: 0,
        })
        expect(res).toEqual({ ok: false, kind: null })
        expect(toXML).not.toHaveBeenCalled()
    })

    it('style copy looks up via StyleManager.getStyleSet and serializes', () => {
        const { ctx, toXML, getStyleSet } = buildCtx()
        const res = services.copyNode(ctx, {
            sceneId: 1, nodeId: 700, nodeType: 'style', scopeId: 1,
        })
        expect(res).toEqual({ ok: true, kind: 'style' })
        expect(getStyleSet).toHaveBeenCalledWith(700)
        expect(toXML).toHaveBeenCalled()
    })

    it('style paste calls StyleManager.registerStyleSet inside undo txn', () => {
        const setName = vi.fn()
        const restoredStyle = {
            get name() { return 'pasted' },
            set name(v: string) { setName(v) },
            uid: 800,
        }
        const { ctx, fromXML, registerStyleSet, startUndoTxn, commitUndoTxn } =
            buildCtx({ restored: restoredStyle })
        services.copyNode(ctx, {
            sceneId: 1, nodeId: 700, nodeType: 'style', scopeId: 1,
        })
        const res = services.pasteNode(ctx, { sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(fromXML).toHaveBeenCalled()
        expect(startUndoTxn).toHaveBeenCalledWith('Paste style')
        expect(registerStyleSet).toHaveBeenCalledWith(restoredStyle, 0, 1)
        expect(commitUndoTxn).toHaveBeenCalled()
    })

    it('style paste uniquifies the name when it collides with an existing one', () => {
        const setName = vi.fn()
        const restoredStyle = {
            get name() { return 'mystyle' },
            set name(v: string) { setName(v) },
        }
        const { ctx } = buildCtx({
            restored: restoredStyle,
            sourceStyleSet: { name: 'mystyle' },
            existingStyleNames: ['mystyle'],
        })
        services.copyNode(ctx, {
            sceneId: 1, nodeId: 700, nodeType: 'style', scopeId: 1,
        })
        const res = services.pasteNode(ctx, { sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(res.newName).toBe('mystyle_1')
        expect(setName).toHaveBeenCalledWith('mystyle_1')
    })

    it('style paste reports ok:false when registerStyleSet fails', () => {
        const restoredStyle = { get name() { return 's' }, set name(_v: string) {} }
        const { ctx } = buildCtx({ restored: restoredStyle, registerOk: false })
        services.copyNode(ctx, {
            sceneId: 1, nodeId: 700, nodeType: 'style', scopeId: 1,
        })
        const res = services.pasteNode(ctx, { sceneId: 1 })
        expect(res.ok).toBe(false)
    })

    it('getClipboardKind returns "style" after a style copy', () => {
        const { ctx } = buildCtx()
        services.copyNode(ctx, {
            sceneId: 1, nodeId: 700, nodeType: 'style', scopeId: 1,
        })
        expect(services.getClipboardKind(ctx, {}).kind).toBe('style')
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
