import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '@renderer/worker/server/services/file/file.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

interface FixtureOpts {
    /** obj.name */
    objName?: string
    /** obj.src -- empty by default. */
    objSrc?: string
    /** What StreamManager.findCompatibleWriterNamesForObj should return (CSV). */
    compatibleNames?: string
    /** Raw output of StreamManager.getInfoJSON2 (parsed JSON). */
    infoJSON?: string
    /** When false, scene lookup fails. */
    sceneExists?: boolean
    /** When false, scene.getObject returns null. */
    objExists?: boolean
    /** What createHandler should return. Default = a working writer stub. */
    writer?: unknown
    /** When false, createHandler throws. */
    createHandlerThrows?: boolean
    /** When true, writer.write() throws. */
    writeThrows?: boolean
    /**
     * Per-object compatibility CSV for listSavableObjects. The sentinel
     * '__throw__' makes findCompatibleWriterNamesForObj throw for that id;
     * a missing id yields ''. When omitted, `compatibleNames` is used for
     * every id.
     */
    compatibleByObjId?: Record<number, string>
    /** Raw output of scene.getSceneDataJSON. */
    sceneDataJSON?: string
}

/** Default scene: one MolCoord, one DensityMap, one MolSurfObj. */
const DEFAULT_SCENE_JSON = JSON.stringify([
    { ID: 1, name: 'scene1' },
    { ID: 10, name: 'mol1', type: 'MolCoord', rends: [] },
    { ID: 11, name: 'map1', type: 'DensityMap', rends: [] },
    { ID: 12, name: 'surf1', type: 'MolSurfObj', rends: [] },
])

function makeFixture(opts: FixtureOpts = {}) {
    const {
        objName = 'mol1',
        objSrc = '',
        compatibleNames = 'pdb,xyz',
        infoJSON = JSON.stringify([
            { name: 'pdb', descr: 'PDB file', fext: '*.pdb;*.ent', category: 1 },
            { name: 'xyz', descr: 'XYZ file', fext: '*.xyz', category: 1 },
            // Reader category (not 1) -- should be filtered out.
            { name: 'pdb-reader', descr: 'PDB reader', fext: '*.pdb', category: 0 },
            // Unknown writer not in candidates -- should be filtered out.
            { name: 'mmcif', descr: 'mmCIF file', fext: '*.cif', category: 1 },
        ]),
        sceneExists = true,
        objExists = true,
        createHandlerThrows = false,
        writeThrows = false,
        compatibleByObjId,
        sceneDataJSON = DEFAULT_SCENE_JSON,
    } = opts

    const obj = { name: objName, src: objSrc, uid: 10 }
    const scene = {
        getObject: vi.fn(() => (objExists ? obj : null)),
        getSceneDataJSON: vi.fn(() => sceneDataJSON),
    }

    const findCompatibleWriterNamesForObj = vi.fn((id: number) => {
        if (!compatibleByObjId) return compatibleNames
        const csv = compatibleByObjId[id] ?? ''
        if (csv === '__throw__') throw new Error('compat boom')
        return csv
    })
    const getInfoJSON2 = vi.fn(() => infoJSON)
    const msgLog = { writeln: vi.fn() }

    const setPath = vi.fn()
    const attach = vi.fn()
    const writeFn = vi.fn(() => { if (writeThrows) throw new Error('write boom') })
    const detach = vi.fn(() => null)
    let convToLink = false
    const writer = opts.writer ?? {
        setPath,
        get convToLink() { return convToLink },
        set convToLink(v: boolean) { convToLink = v },
        attach,
        write: writeFn,
        detach,
    }
    const createHandler = vi.fn(() => {
        if (createHandlerThrows) throw new Error('createHandler boom')
        return writer
    })

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
        strMgr: {
            findCompatibleWriterNamesForObj,
            getInfoJSON2,
            createHandler,
        },
        svc: { getService: vi.fn(() => msgLog) },
    } as unknown as WorkerContext

    return {
        ctx, scene, obj, writer, msgLog,
        findCompatibleWriterNamesForObj, getInfoJSON2, createHandler,
        setPath, attach, writeFn, detach,
        getConvToLink: () => convToLink,
    }
}

describe('getObjectSaveInfo', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns compatible writers in the order they were listed', () => {
        const { ctx, findCompatibleWriterNamesForObj } = makeFixture()
        const res = services.getObjectSaveInfo(ctx, { sceneId: 1, objId: 10 })
        expect(res.ok).toBe(true)
        expect(findCompatibleWriterNamesForObj).toHaveBeenCalledWith(10)
        expect(res.filters.map((f) => f.name)).toEqual(['pdb', 'xyz'])
        // Description + extensions come from getInfoJSON2; *. prefix stripped.
        expect(res.filters[0]).toEqual({
            name: 'pdb',
            description: 'PDB file',
            extensions: ['pdb', 'ent'],
        })
        // Reader entries (category != 1) are not surfaced even if their
        // name matches.
        expect(res.filters.find((f) => f.name === 'pdb-reader')).toBeUndefined()
    })

    it('filters out writers not in the compatibility CSV', () => {
        // mmcif is in the catalogue but not in the compatibility list.
        const { ctx } = makeFixture({ compatibleNames: 'pdb' })
        const res = services.getObjectSaveInfo(ctx, { sceneId: 1, objId: 10 })
        expect(res.filters.map((f) => f.name)).toEqual(['pdb'])
    })

    it('uses obj.name + first writer ext as default name when obj.src is empty', () => {
        const { ctx } = makeFixture({ objName: 'mol1', objSrc: '' })
        const res = services.getObjectSaveInfo(ctx, { sceneId: 1, objId: 10 })
        expect(res.defaultFileName).toBe('mol1.pdb')
        expect(res.defaultDir).toBe('')
    })

    it('uses copy_of_<leaf> + parent dir when obj.src is non-empty', () => {
        const { ctx } = makeFixture({
            objName: 'mol1',
            objSrc: '/Users/me/data/1crn.pdb',
        })
        const res = services.getObjectSaveInfo(ctx, { sceneId: 1, objId: 10 })
        expect(res.defaultFileName).toBe('copy_of_1crn.pdb')
        expect(res.defaultDir).toBe('/Users/me/data')
    })

    it('handles Windows-style backslashes in obj.src', () => {
        const { ctx } = makeFixture({
            objName: 'mol1',
            objSrc: 'C:\\Users\\me\\data\\1crn.pdb',
        })
        const res = services.getObjectSaveInfo(ctx, { sceneId: 1, objId: 10 })
        expect(res.defaultFileName).toBe('copy_of_1crn.pdb')
        expect(res.defaultDir).toBe('C:\\Users\\me\\data')
    })

    it('moves preferredWriter to the head and uses its ext for the default name', () => {
        // Electron cannot preselect a filter row, so the remembered writer is
        // restored by reordering; the default extension must follow it.
        const { ctx } = makeFixture({ objName: 'mol1', objSrc: '' })
        const res = services.getObjectSaveInfo(ctx, {
            sceneId: 1, objId: 10, preferredWriter: 'xyz',
        })
        expect(res.filters.map((f) => f.name)).toEqual(['xyz', 'pdb'])
        expect(res.defaultFileName).toBe('mol1.xyz')
    })

    it('leaves the order unchanged for an unknown or already-first preferredWriter', () => {
        const { ctx } = makeFixture()
        for (const preferredWriter of ['mmcif', 'pdb']) {
            const res = services.getObjectSaveInfo(ctx, {
                sceneId: 1, objId: 10, preferredWriter,
            })
            expect(res.filters.map((f) => f.name)).toEqual(['pdb', 'xyz'])
        }
    })

    it('hides internal qdf writers from the filter list', () => {
        const { ctx } = makeFixture({
            compatibleNames: 'pdb,qdfmol,xyz',
            infoJSON: JSON.stringify([
                { name: 'pdb', descr: 'PDB file', fext: '*.pdb', category: 1 },
                { name: 'qdfmol', descr: 'CueMol coords', fext: '*.qdf', category: 1 },
                { name: 'xyz', descr: 'XYZ file', fext: '*.xyz', category: 1 },
            ]),
        })
        const res = services.getObjectSaveInfo(ctx, { sceneId: 1, objId: 10 })
        expect(res.filters.map((f) => f.name)).toEqual(['pdb', 'xyz'])
    })

    it('returns ok:false when qdf was the object\'s only writer', () => {
        // DensityMap / MolSurfObj / ElePotMap / LWObject have no other writer,
        // so hiding qdf leaves them unsavable by design.
        const { ctx } = makeFixture({ compatibleNames: 'qdfmap' })
        const res = services.getObjectSaveInfo(ctx, { sceneId: 1, objId: 10 })
        expect(res.ok).toBe(false)
        expect(res.filters).toEqual([])
    })

    it('returns ok:false when there are no compatible writers', () => {
        const { ctx } = makeFixture({ compatibleNames: '' })
        const res = services.getObjectSaveInfo(ctx, { sceneId: 1, objId: 10 })
        expect(res.ok).toBe(false)
        expect(res.filters).toEqual([])
    })

    it('returns ok:false on scene / object lookup failure', () => {
        for (const o of [{ sceneExists: false }, { objExists: false }] as const) {
            const { ctx } = makeFixture(o)
            expect(services.getObjectSaveInfo(ctx, { sceneId: 1, objId: 10 }).ok)
                .toBe(false)
        }
    })
})

describe('saveObjectToFile', () => {
    beforeEach(() => vi.clearAllMocks())

    it('runs setPath → convToLink=true → attach → write → detach', () => {
        const { ctx, createHandler, setPath, attach, writeFn, detach, getConvToLink, obj } =
            makeFixture()
        const res = services.saveObjectToFile(ctx, {
            sceneId: 1, objId: 10, path: '/tmp/out.pdb', writerName: 'pdb',
        })
        expect(res).toEqual({ ok: true })
        expect(createHandler).toHaveBeenCalledWith('pdb', 1)
        expect(setPath).toHaveBeenCalledWith('/tmp/out.pdb')
        expect(getConvToLink()).toBe(true)
        expect(attach).toHaveBeenCalledWith(obj)
        expect(writeFn).toHaveBeenCalled()
        expect(detach).toHaveBeenCalled()
    })

    it('reports the written file in the message log, but not on failure', () => {
        const ok = makeFixture()
        services.saveObjectToFile(ok.ctx, {
            sceneId: 1, objId: 10, path: '/tmp/out.pdb', writerName: 'pdb',
        })
        // UXP `onSaveAsObj` putLogMsg text.
        expect(ok.msgLog.writeln).toHaveBeenCalledWith('File: [/tmp/out.pdb] is saved.')

        const failed = makeFixture({ writeThrows: true })
        services.saveObjectToFile(failed.ctx, {
            sceneId: 1, objId: 10, path: '/tmp/out.pdb', writerName: 'pdb',
        })
        expect(failed.msgLog.writeln).not.toHaveBeenCalled()
    })

    it('rejects empty path / empty writerName', () => {
        const { ctx, createHandler } = makeFixture()
        expect(services.saveObjectToFile(ctx, {
            sceneId: 1, objId: 10, path: '', writerName: 'pdb',
        })).toEqual({ ok: false })
        expect(services.saveObjectToFile(ctx, {
            sceneId: 1, objId: 10, path: '/x.pdb', writerName: '',
        })).toEqual({ ok: false })
        expect(createHandler).not.toHaveBeenCalled()
    })

    it('returns ok:false when createHandler throws and skips the attach/write chain', () => {
        const { ctx, setPath, attach, writeFn } = makeFixture({ createHandlerThrows: true })
        const res = services.saveObjectToFile(ctx, {
            sceneId: 1, objId: 10, path: '/x.pdb', writerName: 'pdb',
        })
        expect(res).toEqual({ ok: false })
        expect(setPath).not.toHaveBeenCalled()
        expect(attach).not.toHaveBeenCalled()
        expect(writeFn).not.toHaveBeenCalled()
    })

    it('detaches even when write throws (cleanup)', () => {
        const { ctx, detach } = makeFixture({ writeThrows: true })
        const res = services.saveObjectToFile(ctx, {
            sceneId: 1, objId: 10, path: '/x.pdb', writerName: 'pdb',
        })
        expect(res).toEqual({ ok: false })
        // Cleanup must still happen so the worker doesn't leak a dangling
        // attached writer.
        expect(detach).toHaveBeenCalled()
    })

    it('returns ok:false on scene / object lookup failure', () => {
        for (const o of [{ sceneExists: false }, { objExists: false }] as const) {
            const { ctx, createHandler } = makeFixture(o)
            expect(services.saveObjectToFile(ctx, {
                sceneId: 1, objId: 10, path: '/x.pdb', writerName: 'pdb',
            })).toEqual({ ok: false })
            expect(createHandler).not.toHaveBeenCalled()
        }
    })
})

describe('listSavableObjects', () => {
    beforeEach(() => vi.clearAllMocks())

    it('keeps only objects that have at least one compatible writer', () => {
        // UXP `onFileSaveAs` drops objects whose compatibility CSV is empty;
        // a throwing lookup is treated the same way. A qdf-only object (here
        // the DensityMap) drops out too, since qdf writers are hidden.
        const { ctx } = makeFixture({
            compatibleByObjId: { 10: 'pdb,xyz', 11: 'qdfmap', 12: '__throw__' },
        })
        const res = services.listSavableObjects(ctx, { sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(res.objects).toEqual([
            { id: 10, name: 'mol1', className: 'MolCoord' },
        ])
    })

    it('returns ok:false when the scene is missing', () => {
        const { ctx } = makeFixture({ sceneExists: false })
        expect(services.listSavableObjects(ctx, { sceneId: 1 }))
            .toEqual({ ok: false, objects: [] })
    })
})
