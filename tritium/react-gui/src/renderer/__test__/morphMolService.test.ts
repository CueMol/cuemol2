/**
 * Pin contracts for `morphMol.service` (UXP `morphanim-tool.js` port):
 *   - convertToMorphMol: `toXML2(mol, 'MorphMol')` -> `fromXML` ->
 *     `appendThisFrame()` -> destroyObject(old) -> addObject(new), all inside
 *     one 'Conv Mol to MorphMol' undo txn, rolled back on failure.
 *   - getMorphFrames: parses getFrameInfoJSON; flags the "<this>" frame;
 *     reports isMorphMol=false for a non-MorphMol object.
 *   - addMorphFrameFromFile: pdb reader create/attach/read/detach then
 *     `insertBefore(frameMol, insertIndex)` inside 'Add PDB to MorphMol';
 *     the frame molecule is never added to the scene.
 *   - addMorphFrameFromMol: `toXML`/`fromXML` deep copy -> insertBefore
 *     inside 'Add mol to MorphMol'.
 *   - removeMorphFrame: refuses the "<this>" frame and out-of-range indices
 *     without opening a txn; otherwise removeFrame inside
 *     'Delete MorphMol item'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

import { services } from '@renderer/worker/server/services/traj/traj.service'

const {
    convertToMorphMol,
    getMorphFrames,
    addMorphFrameFromFile,
    addMorphFrameFromMol,
    removeMorphFrame,
} = services

const FRAMES_JSON =
    '[{"name": "(this)","src": "","srctype": "<this>"},' +
    '{"name": "state2.pdb","src": "/tmp/state2.pdb","srctype": "pdb"}]'

function makeScene(uid = 100) {
    return {
        uid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn(),
        destroyObject: vi.fn(),
        addObject: vi.fn(),
    }
}

function makeMorph(json = FRAMES_JSON) {
    return {
        uid: 55,
        getClassName: vi.fn(() => 'MorphMol'),
        getFrameInfoJSON: vi.fn(() => json),
        insertBefore: vi.fn(),
        removeFrame: vi.fn(),
        appendThisFrame: vi.fn(),
    }
}

function makeCtx(
    scene: ReturnType<typeof makeScene> | null,
    strMgr: Record<string, unknown> = {},
) {
    return {
        sceMgr: {
            getScene: vi.fn((id: number) => (id === 100 ? scene : null)),
        },
        strMgr,
    } as unknown as WorkerContext
}

beforeEach(() => vi.clearAllMocks())

describe('convertToMorphMol', () => {
    function makeConvertCtx() {
        const scene = makeScene(100)
        const srcMol = {
            getClassName: vi.fn(() => 'MolCoord'),
            get name() { return '1crn' },
        }
        scene.getObject = vi.fn((id: number) => (id === 5 ? srcMol : null))
        const setName = vi.fn()
        const morph = {
            uid: 55,
            appendThisFrame: vi.fn(),
            get name() { return '' },
            set name(v: string) { setName(v) },
        }
        const xml = { __xml: true }
        const strMgr = {
            toXML2: vi.fn(() => xml),
            fromXML: vi.fn(() => morph),
        }
        const ctx = makeCtx(scene, strMgr)
        return { ctx, scene, srcMol, morph, setName, xml, strMgr }
    }

    it('serializes as MorphMol, appends the this-frame, and swaps the objects in one txn', () => {
        const { ctx, scene, srcMol, morph, setName, xml, strMgr } = makeConvertCtx()

        const res = convertToMorphMol(ctx, { sceneId: 100, objId: 5 })

        expect(strMgr.toXML2).toHaveBeenCalledWith(srcMol, 'MorphMol')
        expect(strMgr.fromXML).toHaveBeenCalledWith(xml, 100)
        expect(morph.appendThisFrame).toHaveBeenCalled()
        expect(setName).toHaveBeenCalledWith('1crn')
        expect(scene.destroyObject).toHaveBeenCalledWith(5)
        expect(scene.addObject).toHaveBeenCalledWith(morph)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Conv Mol to MorphMol')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(res).toEqual({ ok: true, morphObjId: 55, morphObjName: '1crn' })
    })

    it('rolls back when the XML round trip fails', () => {
        const { ctx, scene, strMgr } = makeConvertCtx()
        ;(strMgr.fromXML as ReturnType<typeof vi.fn>).mockReturnValue(null)

        const res = convertToMorphMol(ctx, { sceneId: 100, objId: 5 })

        expect(res.ok).toBe(false)
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.destroyObject).not.toHaveBeenCalled()
    })

    it('refuses an object that is already a MorphMol', () => {
        const { ctx, scene, srcMol } = makeConvertCtx()
        ;(srcMol.getClassName as ReturnType<typeof vi.fn>).mockReturnValue('MorphMol')

        const res = convertToMorphMol(ctx, { sceneId: 100, objId: 5 })

        expect(res.ok).toBe(false)
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })
})

describe('getMorphFrames', () => {
    it('parses frames and flags the "<this>" entry', () => {
        const scene = makeScene(100)
        scene.getObject = vi.fn(() => makeMorph())
        const ctx = makeCtx(scene)

        const res = getMorphFrames(ctx, { sceneId: 100, objId: 55 })

        expect(res).toEqual({
            ok: true,
            isMorphMol: true,
            frames: [
                { name: '(this)', src: '', isThis: true },
                { name: 'state2.pdb', src: '/tmp/state2.pdb', isThis: false },
            ],
        })
    })

    it('reports isMorphMol=false for a plain MolCoord', () => {
        const scene = makeScene(100)
        scene.getObject = vi.fn(() => ({ getClassName: () => 'MolCoord' }))
        const ctx = makeCtx(scene)

        const res = getMorphFrames(ctx, { sceneId: 100, objId: 5 })

        expect(res).toEqual({ ok: true, isMorphMol: false, frames: [] })
    })
})

describe('addMorphFrameFromFile', () => {
    function makeAddCtx() {
        const scene = makeScene(100)
        const morph = makeMorph()
        scene.getObject = vi.fn((id: number) => (id === 55 ? morph : null))
        const setName = vi.fn()
        const frameMol = {
            get name() { return '' },
            set name(v: string) { setName(v) },
        }
        const reader = {
            compress: '',
            setPath: vi.fn(),
            attach: vi.fn(),
            read: vi.fn(),
            detach: vi.fn(),
            createDefaultObj: vi.fn(() => frameMol),
        }
        const strMgr = { createHandler: vi.fn(() => reader) }
        const ctx = makeCtx(scene, strMgr)
        return { ctx, scene, morph, reader, frameMol, setName, strMgr }
    }

    it('reads the PDB and inserts it as a frame inside "Add PDB to MorphMol"', () => {
        const { ctx, scene, morph, reader, frameMol, setName, strMgr } = makeAddCtx()

        const res = addMorphFrameFromFile(ctx, {
            sceneId: 100, objId: 55, path: '/tmp/state2.pdb', insertIndex: -1,
        })

        expect(strMgr.createHandler).toHaveBeenCalledWith('pdb', 0)
        expect(reader.setPath).toHaveBeenCalledWith('/tmp/state2.pdb')
        expect(reader.compress).toBe('')
        expect(reader.attach).toHaveBeenCalledWith(frameMol)
        expect(reader.read).toHaveBeenCalled()
        expect(reader.detach).toHaveBeenCalled()
        expect(setName).toHaveBeenCalledWith('state2.pdb')
        expect(morph.insertBefore).toHaveBeenCalledWith(frameMol, -1)
        // Frame molecules stay detached from the scene (UXP parity).
        expect(scene.addObject).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Add PDB to MorphMol')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(res).toEqual({ ok: true })
    })

    it('sets gzip compression for a .pdb.gz path', () => {
        const { ctx, reader } = makeAddCtx()
        addMorphFrameFromFile(ctx, {
            sceneId: 100, objId: 55, path: '/tmp/state2.pdb.gz', insertIndex: 0,
        })
        expect(reader.compress).toBe('gzip')
    })

    it('rolls back and reports the error when the read throws', () => {
        const { ctx, scene, reader } = makeAddCtx()
        reader.read = vi.fn(() => { throw new Error('bad file') })

        const res = addMorphFrameFromFile(ctx, {
            sceneId: 100, objId: 55, path: '/tmp/broken.pdb', insertIndex: -1,
        })

        expect(res.ok).toBe(false)
        expect(res.error).toContain('bad file')
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})

describe('addMorphFrameFromMol', () => {
    it('deep-copies the source mol and inserts it inside "Add mol to MorphMol"', () => {
        const scene = makeScene(100)
        const morph = makeMorph()
        const srcMol = { getClassName: () => 'MolCoord' }
        scene.getObject = vi.fn((id: number) =>
            (id === 55 ? morph : id === 7 ? srcMol : null))
        const copy = { __copy: true }
        const xml = { __xml: true }
        const strMgr = {
            toXML: vi.fn(() => xml),
            fromXML: vi.fn(() => copy),
        }
        const ctx = makeCtx(scene, strMgr)

        const res = addMorphFrameFromMol(ctx, {
            sceneId: 100, objId: 55, srcObjId: 7, insertIndex: 2,
        })

        expect(strMgr.toXML).toHaveBeenCalledWith(srcMol)
        expect(strMgr.fromXML).toHaveBeenCalledWith(xml, 100)
        expect(morph.insertBefore).toHaveBeenCalledWith(copy, 2)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Add mol to MorphMol')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(res).toEqual({ ok: true })
    })
})

describe('removeMorphFrame', () => {
    function makeRemoveCtx() {
        const scene = makeScene(100)
        const morph = makeMorph()
        scene.getObject = vi.fn((id: number) => (id === 55 ? morph : null))
        const ctx = makeCtx(scene)
        return { ctx, scene, morph }
    }

    it('removes a regular frame inside "Delete MorphMol item"', () => {
        const { ctx, scene, morph } = makeRemoveCtx()

        const res = removeMorphFrame(ctx, { sceneId: 100, objId: 55, frameIndex: 1 })

        expect(morph.removeFrame).toHaveBeenCalledWith(1)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Delete MorphMol item')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(res).toEqual({ ok: true })
    })

    it('refuses the "(this)" frame without opening a txn', () => {
        const { ctx, scene, morph } = makeRemoveCtx()

        const res = removeMorphFrame(ctx, { sceneId: 100, objId: 55, frameIndex: 0 })

        expect(res.ok).toBe(false)
        expect(morph.removeFrame).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('refuses an out-of-range index without opening a txn', () => {
        const { ctx, scene, morph } = makeRemoveCtx()

        const res = removeMorphFrame(ctx, { sceneId: 100, objId: 55, frameIndex: 9 })

        expect(res.ok).toBe(false)
        expect(morph.removeFrame).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })
})
