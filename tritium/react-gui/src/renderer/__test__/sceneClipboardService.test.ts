/**
 * Worker-side scene Copy / Paste.
 *
 * The services are stateless -- copy returns the serialized bytes and paste
 * takes them back -- because the clipboard itself is the OS clipboard (see
 * `main/cuemolClipboard.ts`). `copyPaste` below threads the payload the way
 * the renderer + main relay does, so these tests exercise the same wire the
 * app uses.
 */
import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/clipboard/clipboard.service'
import type {
    CopyNodeArgs,
    CopyNodeResult,
    PasteNodeArgs,
    PasteNodeResult,
} from '@renderer/worker/server/services/clipboard/clipboard.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

/**
 * Round-trip a copy result into a paste call, as the renderer does via the
 * OS clipboard. Splitting these would let a change break the pairing
 * silently, so every paste test goes through here.
 */
function copyPaste(
    ctx: WorkerContext,
    copyArgs: CopyNodeArgs,
    pasteArgs: Omit<PasteNodeArgs, 'kind' | 'bytes' | 'form' | 'name'>,
): PasteNodeResult {
    const c = services.copyNode(ctx, copyArgs)
    return pasteCopied(ctx, c, pasteArgs)
}

/** Paste an already-taken copy result. */
function pasteCopied(
    ctx: WorkerContext,
    c: CopyNodeResult,
    pasteArgs: Omit<PasteNodeArgs, 'kind' | 'bytes' | 'form' | 'name'>,
): PasteNodeResult {
    return services.pasteNode(ctx, {
        ...pasteArgs,
        kind: c.kind!,
        form: c.form,
        name: c.name,
        bytes: c.bytes!,
    })
}

interface BuildCtxOpts {
    /** Existing object names in the destination scene (for paste uniquification). */
    existingObjectNames?: string[]
    /** Existing renderer names on the target object (for paste uniquification). */
    existingRendererNames?: string[]
    /** Renderer names taken scene-wide (for group-name uniquification). */
    existingSceneRendNames?: string[]
    /** Mock object returned by scene.getObject. If omitted, returns the source object. */
    customObject?: unknown
    /** What strMgr.fromXML should return. */
    restored?: unknown
    /** What strMgr.rendArrayFromXML should return ([grpName, ...natives]). */
    restoredArray?: unknown[]
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
    const setCreatedGroupName = vi.fn()
    const createdGroup = {
        uid: 777,
        set name(v: string) { setCreatedGroupName(v) },
        get name() { return '' },
    }
    const targetObj = {
        attachRenderer,
        getRendererByName: vi.fn((n: string) =>
            (opts.existingRendererNames ?? []).includes(n) ? { __r: n } : null,
        ),
        createRenderer: vi.fn(() => createdGroup),
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
        getRendByName: vi.fn((n: string) =>
            (opts.existingSceneRendNames ?? []).includes(n) ? { uid: 12345 } : null,
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
    const rendGrpToXML = vi.fn(() => ({ __byteArray: true, __ary: true }))
    const arrayToXML = vi.fn(() => ({ __byteArray: true, __multi: true }))
    const rendArrayFromXML = vi.fn(() => opts.restoredArray ?? [])
    // Identity: tests hand wrapper-shaped mocks straight through.
    const createWrapper = vi.fn((n: unknown) => n)

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

    // Stand-in for the N-API ByteArray <-> Uint8Array bridge. The real one
    // is symmetric and origin-agnostic: any non-empty byte buffer inflates
    // into a ByteArray, which is what makes a payload from another process
    // pasteable at all.
    const copyToTypedArray = vi.fn(() => new Uint8Array([1, 2, 3]))
    const copyFromTypedArray = vi.fn((b: Uint8Array) => ({
        __byteArray: true,
        __bytes: b,
    }))

    const ctx = {
        sceMgr: { getScene: vi.fn(() => mockScene) },
        strMgr: { toXML, fromXML, rendGrpToXML, arrayToXML, rendArrayFromXML, createWrapper },
        svc: { getService, copyToTypedArray, copyFromTypedArray },
    } as unknown as WorkerContext

    return {
        ctx, mockScene, sourceObj, sourceRend, targetObj, targetGroup, restored,
        addObject, attachRenderer, toXML, fromXML,
        rendGrpToXML, arrayToXML, rendArrayFromXML, createWrapper,
        createdGroup, setCreatedGroupName,
        setObjName, setRendName,
        startUndoTxn, commitUndoTxn,
        styleMgr, sourceStyleSet,
        getStyleSet, hasStyleSet, registerStyleSet,
        copyToTypedArray, copyFromTypedArray,
    }
}

describe('sceneClipboard.copyNode', () => {
    it('object copy stores XML + class info and returns kind=object', () => {
        const { ctx, toXML } = buildCtx()
        const res = services.copyNode(ctx, { sceneId: 1, nodeId: 10, nodeType: 'object' })
        expect(res).toMatchObject({ ok: true, kind: 'object', form: 'single', name: 'mol1' })
        expect(res.bytes).toBeInstanceOf(Uint8Array)
        expect(toXML).toHaveBeenCalledTimes(1)
    })

    it('renderer copy returns kind=renderer (via scene.getRenderer)', () => {
        const { ctx, mockScene, toXML } = buildCtx()
        const res = services.copyNode(ctx, { sceneId: 1, nodeId: 100, nodeType: 'renderer' })
        expect(res).toMatchObject({ ok: true, kind: 'renderer', form: 'single' })
        expect(mockScene.getRenderer).toHaveBeenCalledWith(100)
        expect(toXML).toHaveBeenCalled()
    })

    it('rendGroup copy serializes member natives + group name via rendGrpToXML (kind stays renderer)', () => {
        const { ctx, mockScene, rendGrpToXML, toXML } = buildCtx()
        const parentObj = { rend_uids: '50,100,101' }
        const grp = { uid: 50, name: 'grpA', getClientObj: () => parentObj }
        const member = { uid: 100, name: 'r1', group: 'grpA', wrapped: { __native: 1 } }
        const stranger = { uid: 101, name: 'r2', group: '', wrapped: { __native: 2 } }
        ;(mockScene.getRenderer as ReturnType<typeof vi.fn>).mockImplementation(
            (id?: number) =>
                id === 50 ? grp : id === 100 ? member : id === 101 ? stranger : null)
        const res = services.copyNode(ctx, { sceneId: 1, nodeId: 50, nodeType: 'rendGroup' })
        // Natives of group members only (unwrapped via .wrapped); the
        // group renderer itself and non-members are excluded.
        expect(rendGrpToXML).toHaveBeenCalledWith([{ __native: 1 }], 'grpA')
        expect(toXML).not.toHaveBeenCalled()
        // Kind stays 'renderer' so ctxmenu Paste gating is unchanged (UXP
        // qscrend | qscrendary equivalence); form distinguishes the shape.
        expect(res).toMatchObject({
            ok: true, kind: 'renderer', form: 'rendArray', name: 'grpA',
        })
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

describe('sceneClipboard.copyNodes (multi-selection copy)', () => {
    // Mirrors UXP `onMultiCopy`: renderers go through arrayToXML, and the
    // two refusals it alerts on are reported back rather than half-copied.
    it('serializes a renderer multi-selection with arrayToXML', () => {
        const h = buildCtx()
        const res = services.copyNodes(h.ctx, {
            sceneId: 7,
            nodeIds: [100, 101],
            nodeTypes: ['renderer', 'renderer'],
        })
        expect(res).toMatchObject({ ok: true, kind: 'renderer', form: 'rendArray' })
        expect(h.arrayToXML).toHaveBeenCalledTimes(1)
        // rendGrpToXML is the single-group path and must stay out of it.
        expect(h.rendGrpToXML).not.toHaveBeenCalled()
    })

    it('serializes a group\'s members, never the group shell itself', () => {
        // The harness's group stub exposes no matching children, so the
        // expansion yields nothing and the copy is refused rather than
        // writing an empty array to the clipboard.
        const h = buildCtx()
        const res = services.copyNodes(h.ctx, {
            sceneId: 7,
            nodeIds: [888],
            nodeTypes: ['rendGroup'],
        })
        expect(res.ok).toBe(false)
        expect(h.arrayToXML).not.toHaveBeenCalled()
    })

    it('refuses a mixed-type selection (UXP alerts here)', () => {
        const h = buildCtx()
        const res = services.copyNodes(h.ctx, {
            sceneId: 7,
            nodeIds: [10, 100],
            nodeTypes: ['object', 'renderer'],
        })
        expect(res).toEqual({ ok: false, kind: null, reason: 'mixed' })
        expect(h.arrayToXML).not.toHaveBeenCalled()
    })

    it('refuses multiple objects, as UXP does', () => {
        const h = buildCtx()
        const res = services.copyNodes(h.ctx, {
            sceneId: 7,
            nodeIds: [10, 11],
            nodeTypes: ['object', 'object'],
        })
        expect(res).toEqual({ ok: false, kind: null, reason: 'objectUnsupported' })
        expect(h.arrayToXML).not.toHaveBeenCalled()
    })

    it('treats a group as a renderer for the type check', () => {
        // UXP `convElemNodeTypes` folds rendGroup into renderer, so a mix of
        // the two is NOT "mixed".
        const h = buildCtx()
        const res = services.copyNodes(h.ctx, {
            sceneId: 7,
            nodeIds: [100, 888],
            nodeTypes: ['renderer', 'rendGroup'],
        })
        // Not refused as 'mixed'; the plain renderer still makes it in.
        expect(res.reason).toBeUndefined()
        expect(res.ok).toBe(true)
    })

    it('refuses an empty selection rather than writing an empty payload', () => {
        const h = buildCtx()
        const res = services.copyNodes(h.ctx, { sceneId: 7, nodeIds: [], nodeTypes: [] })
        expect(res.ok).toBe(false)
        expect(h.arrayToXML).not.toHaveBeenCalled()
    })
})

describe('sceneClipboard.pasteNode', () => {
    it('returns ok:false when the clipboard held no payload', () => {
        const { ctx } = buildCtx()
        expect(services.pasteNode(ctx, {
            sceneId: 1, kind: 'object', bytes: new Uint8Array(),
        }).ok).toBe(false)
    })

    it('object paste calls fromXML + scene.addObject under undo txn', () => {
        const { ctx, fromXML, addObject, startUndoTxn, commitUndoTxn } = buildCtx()
        const res = copyPaste(ctx,
            { sceneId: 1, nodeId: 10, nodeType: 'object' }, { sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(res.newId).toBe(200)
        expect(startUndoTxn).toHaveBeenCalledWith('Paste object')
        expect(fromXML).toHaveBeenCalled()
        expect(addObject).toHaveBeenCalledWith(res === null ? null : expect.anything())
        expect(commitUndoTxn).toHaveBeenCalled()
    })

    it('object paste uniquifies the name on conflict (mol1 → mol1_1)', () => {
        const { ctx, setObjName } = buildCtx({ existingObjectNames: ['mol1'] })
        const res = copyPaste(ctx,
            { sceneId: 1, nodeId: 10, nodeType: 'object' }, { sceneId: 1 })
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
        const res = copyPaste(ctx,
            { sceneId: 1, nodeId: 100, nodeType: 'renderer' },
            { sceneId: 1, targetObjId: 999 })
        expect(res.ok).toBe(true)
        expect(attachRenderer).toHaveBeenCalledWith(restored)
        expect(setName).toHaveBeenCalledWith('rend1')
    })

    it('renderer paste returns ok:false when targetObjId is omitted', () => {
        const { ctx } = buildCtx()
        const res = copyPaste(ctx,
            { sceneId: 1, nodeId: 100, nodeType: 'renderer' }, { sceneId: 1 })
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
        const res = copyPaste(ctx,
            { sceneId: 1, nodeId: 100, nodeType: 'renderer' },
            { sceneId: 1, targetObjId: 999 })
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
        copyPaste(ctx,
            { sceneId: 1, nodeId: 100, nodeType: 'renderer' },
            { sceneId: 1, targetObjId: 999 })
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
        const res = copyPaste(ctx,
            { sceneId: 1, nodeId: 100, nodeType: 'renderer' },
            { sceneId: 1, targetGroupId: 888 })
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
        const res = copyPaste(ctx,
            { sceneId: 1, nodeId: 100, nodeType: 'renderer' },
            { sceneId: 1, targetGroupId: 888 })
        expect(res.newName).toBe('rend1_1')
        expect(setName).toHaveBeenCalledWith('rend1_1')
    })

    it('targetGroupId returns ok:false when the group has no resolvable client mol', () => {
        const { ctx, targetGroup } = buildCtx()
        targetGroup.getClientObj.mockReturnValueOnce(null as unknown as never)
        const res = copyPaste(ctx,
            { sceneId: 1, nodeId: 100, nodeType: 'renderer' },
            { sceneId: 1, targetGroupId: 888 })
        expect(res.ok).toBe(false)
    })

    // --- rendArray (deep group copy) paste ---

    /** Build a renderer-shaped mock for rendArrayFromXML output. */
    function makeArrayRend(name: string, opts: { compatible?: boolean } = {}) {
        const setName = vi.fn()
        const setGroup = vi.fn()
        const rend = {
            get name() { return name },
            set name(v: string) { setName(v) },
            get group() { return '' },
            set group(v: string) { setGroup(v) },
            isCompatibleObj: vi.fn(() => opts.compatible ?? true),
        }
        return { rend, setName, setGroup }
    }

    /** Take a rendArray copy (deep rendGroup copy) to paste back. */
    function takeRendArrayCopy(ctx: WorkerContext) {
        // Default fixture: getRenderer(50) -> sourceRend (no members), so
        // this yields form='rendArray' XML; paste output is then driven by
        // the restoredArray option.
        return services.copyNode(ctx, { sceneId: 1, nodeId: 50, nodeType: 'rendGroup' })
    }

    it('rendArray paste onto a rendGroup row joins the clicked group (XML group name ignored)', () => {
        const a = makeArrayRend('r1')
        const b = makeArrayRend('r2')
        const f = buildCtx({ restoredArray: ['srcGrp', a.rend, b.rend] })
        const res = pasteCopied(f.ctx, takeRendArrayCopy(f.ctx),
            { sceneId: 1, targetGroupId: 888 })
        expect(res.ok).toBe(true)
        expect(f.startUndoTxn).toHaveBeenCalledWith('Paste renderers')
        expect(f.rendArrayFromXML).toHaveBeenCalledWith(expect.anything(), 1)
        // Each native goes through createWrapper (UXP convPolymObj).
        expect(f.createWrapper).toHaveBeenCalledTimes(2)
        // Both land in the clicked group; no new group is created.
        expect(a.setGroup).toHaveBeenCalledWith('grpA')
        expect(b.setGroup).toHaveBeenCalledWith('grpA')
        expect(f.targetObj.createRenderer).not.toHaveBeenCalled()
        expect(f.attachRenderer).toHaveBeenCalledTimes(2)
        expect(res.newName).toBe('grpA')
    })

    it('rendArray paste onto an object row auto-creates the group with a scene-wide unique name', () => {
        const a = makeArrayRend('r1')
        const f = buildCtx({
            restoredArray: ['srcGrp', a.rend],
            existingSceneRendNames: ['srcGrp'],
        })
        const res = pasteCopied(f.ctx, takeRendArrayCopy(f.ctx),
            { sceneId: 1, targetObjId: 999 })
        expect(res.ok).toBe(true)
        expect(f.targetObj.createRenderer).toHaveBeenCalledWith('*group')
        // 'srcGrp' is taken scene-wide -> uniquified to 'srcGrp_1'.
        expect(f.setCreatedGroupName).toHaveBeenCalledWith('srcGrp_1')
        expect(a.setGroup).toHaveBeenCalledWith('srcGrp_1')
        expect(f.attachRenderer).toHaveBeenCalledWith(a.rend)
        expect(res.newId).toBe(777)
        expect(res.newName).toBe('srcGrp_1')
    })

    it('rendArray paste with empty XML group name skips group creation and clears rend.group', () => {
        const a = makeArrayRend('r1')
        const bad = makeArrayRend('rX', { compatible: false })
        const f = buildCtx({ restoredArray: ['', a.rend, bad.rend] })
        const res = pasteCopied(f.ctx, takeRendArrayCopy(f.ctx),
            { sceneId: 1, targetObjId: 999 })
        expect(res.ok).toBe(true)
        expect(f.targetObj.createRenderer).not.toHaveBeenCalled()
        expect(a.setGroup).toHaveBeenCalledWith('')
        // Incompatible renderer is skipped, the rest still paste.
        expect(bad.setGroup).not.toHaveBeenCalled()
        expect(f.attachRenderer).toHaveBeenCalledTimes(1)
        expect(res.newName).toBe('r1')
        expect(res.newId).toBeNull()
    })
})

describe('sceneClipboard camera branch', () => {
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
            svc: {
                getService: vi.fn(() => null),
                copyToTypedArray: vi.fn(() => new Uint8Array([1, 2, 3])),
                copyFromTypedArray: vi.fn((b: Uint8Array) => ({
                    __byteArray: true,
                    __bytes: b,
                })),
            },
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
        expect(ok).toMatchObject({ ok: true, kind: 'camera', name: 'cam0' })
        expect(getCameraRef).toHaveBeenCalledWith('cam0')
        expect(toXML).toHaveBeenCalled()
    })

    it('camera paste calls scene.setCamera + notifyLoaded under "Paste camera" txn', () => {
        const { ctx, setCamera, restoredCam, startUndoTxn } = buildCameraCtx()
        const res = copyPaste(ctx, {
            sceneId: 1, nodeId: -1000, nodeType: 'camera', cameraName: 'cam0',
        }, { sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(res.newName).toBe('cam0')
        expect(startUndoTxn).toHaveBeenCalledWith('Paste camera')
        expect(setCamera).toHaveBeenCalledWith('cam0', restoredCam)
        expect(restoredCam.notifyLoaded).toHaveBeenCalled()
    })

    it('camera paste uniquifies on name collision via copy{i}_<orig>', () => {
        const { ctx, setCamera } = buildCameraCtx({ existingNames: ['cam0'] })
        const res = copyPaste(ctx, {
            sceneId: 1, nodeId: -1000, nodeType: 'camera', cameraName: 'cam0',
        }, { sceneId: 1 })
        expect(res.newName).toBe('copy1_cam0')
        expect(setCamera).toHaveBeenCalledWith('copy1_cam0', expect.anything())
    })

    it('pastes a payload that carries no source name (a foreign copy)', () => {
        // A payload copied in CueMol2 arrives with no metadata beyond its
        // kind, so every branch has to fall back to the name inside the
        // restored XML. Camera paste is the one that reads it first.
        const { ctx, setCamera } = buildCameraCtx()
        const c = services.copyNode(ctx, {
            sceneId: 1, nodeId: -1000, nodeType: 'camera', cameraName: 'cam0',
        })
        const res = services.pasteNode(ctx, {
            sceneId: 1, kind: 'camera', bytes: c.bytes!,
        })
        expect(res.newName).toBe('cam0')
        expect(setCamera).toHaveBeenCalledWith('cam0', expect.anything())
    })
})

describe('sceneClipboard style branch', () => {
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
        expect(res).toMatchObject({ ok: true, kind: 'style', name: 'mystyle' })
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
        const res = copyPaste(ctx, {
            sceneId: 1, nodeId: 700, nodeType: 'style', scopeId: 1,
        }, { sceneId: 1 })
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
        const res = copyPaste(ctx, {
            sceneId: 1, nodeId: 700, nodeType: 'style', scopeId: 1,
        }, { sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(res.newName).toBe('mystyle_1')
        expect(setName).toHaveBeenCalledWith('mystyle_1')
    })

    it('style paste reports ok:false when registerStyleSet fails', () => {
        const restoredStyle = { get name() { return 's' }, set name(_v: string) {} }
        const { ctx } = buildCtx({ restored: restoredStyle, registerOk: false })
        const res = copyPaste(ctx, {
            sceneId: 1, nodeId: 700, nodeType: 'style', scopeId: 1,
        }, { sceneId: 1 })
        expect(res.ok).toBe(false)
    })
})

describe('sceneClipboard statelessness', () => {
    // The services hold no clipboard of their own: the OS clipboard is the
    // only state. That is what lets a payload cross to another CueMol
    // process, and what stops a stale worker cache from shadowing a copy
    // made elsewhere.
    it('copy leaves nothing behind for a later paste to find', () => {
        const a = buildCtx()
        services.copyNode(a.ctx, { sceneId: 1, nodeId: 10, nodeType: 'object' })
        // A paste that is not handed the payload has nothing to restore,
        // even in the same worker process.
        const b = buildCtx()
        expect(services.pasteNode(b.ctx, {
            sceneId: 1, kind: 'object', bytes: new Uint8Array(),
        }).ok).toBe(false)
        expect(b.fromXML).not.toHaveBeenCalled()
    })

    it('pastes a payload produced by a different ctx (another window)', () => {
        const a = buildCtx()
        const copied = services.copyNode(a.ctx, {
            sceneId: 1, nodeId: 10, nodeType: 'object',
        })
        // The bytes are the whole contract; the destination re-inflates
        // them through its own ByteArray bridge.
        const b = buildCtx()
        const res = services.pasteNode(b.ctx, {
            sceneId: 1, kind: 'object', bytes: copied.bytes!,
        })
        expect(b.copyFromTypedArray).toHaveBeenCalledWith(copied.bytes)
        expect(res.ok).toBe(true)
    })
})
