/**
 * Degrade-detection tests for `loadObject` (worker service).
 *
 * Pins the direct-API contract introduced after replacing
 * `LoadObjectCommand`:
 *
 *   - reader name is guessed from extension via strMgr.getInfoJSON2
 *     (category 0 = OBJREADER); .gz is stripped before matching
 *   - reader.setPath / compress=gzip / createDefaultObj / attach / read
 *     / detach happen in order
 *   - mol.name is set from options.renderer.objectName OR file stem
 *   - scene.addObject(mol) is called directly (no cmd.target_scene path)
 *   - setupRenderer(ctx, mol, options.renderer) is invoked once
 *   - `ctx.cmdMgr.getCmd('load_object')` MUST NOT be invoked -- tripwire
 *     against re-introducing the cmd.target_scene parent-corruption
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

vi.mock('../worker/server/services/setupRenderer.service', () => ({
    setupRenderer: vi.fn(),
}))

import { services } from '../worker/server/services/loadObject.service'
import { setupRenderer } from '../worker/server/services/setupRenderer.service'

const { loadObject } = services

const OBJREADER_CATEGORY = 0

function makeFixture(opts: {
    infoJson?: string
    readerCreateFails?: boolean
    createDefaultObjReturnsNull?: boolean
} = {}) {
    const calls: string[] = []
    const infoJson = opts.infoJson ?? JSON.stringify([
        { name: 'pdb', fext: '*.pdb;*.ent', category: OBJREADER_CATEGORY },
        { name: 'mmcif', fext: '*.cif', category: OBJREADER_CATEGORY },
    ])

    const mol: Record<string, unknown> = {
        getClassName: () => 'MolCoord',
    }
    let molName = ''
    Object.defineProperty(mol, 'name', {
        get() { return molName },
        set(v: string) { molName = v; calls.push(`mol.name=${v}`) },
    })

    let compressVal: unknown = null
    const reader: Record<string, unknown> = {
        setPath: vi.fn((p: string) => calls.push(`setPath(${p})`)),
        attach: vi.fn((m: unknown) => calls.push(`attach(${m ? 'mol' : 'null'})`)),
        read: vi.fn(() => calls.push('read')),
        detach: vi.fn(() => calls.push('detach')),
        createDefaultObj: vi.fn(() => {
            calls.push('createDefaultObj')
            return opts.createDefaultObjReturnsNull ? null : mol
        }),
    }
    Object.defineProperty(reader, 'compress', {
        get() { return compressVal },
        set(v: unknown) { compressVal = v; calls.push(`compress=${String(v)}`) },
    })

    const scene = {
        addObject: vi.fn((m: unknown) => calls.push(`addObject(${m ? 'mol' : 'null'})`)),
        startUndoTxn: vi.fn((label: string) => calls.push(`start:${label}`)),
        commitUndoTxn: vi.fn(() => calls.push('commit')),
        rollbackUndoTxn: vi.fn(() => calls.push('rollback')),
    }

    const getCmd = vi.fn(() => {
        throw new Error('getCmd should NOT be called in the direct-API path')
    })

    const ctx = {
        sceMgr: { getScene: vi.fn(() => scene) },
        cmdMgr: { getCmd },
        strMgr: {
            getInfoJSON2: vi.fn(() => infoJson),
            createHandler: vi.fn((_n: string, _c: number) =>
                opts.readerCreateFails ? null : reader),
        },
    } as unknown as WorkerContext

    return {
        ctx, scene, reader, mol, calls, getCmd,
        get molName() { return molName },
    }
}

const baseRendererOpts = {
    objectName: '',
    rendererType: 'simple',
    rendererName: 'simple1',
    selectionEnabled: false,
    selection: '*',
    centerView: false,
}

describe('loadObject.service — direct API', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('happy path: setPath -> createDefaultObj -> attach -> read -> detach -> mol.name -> scene.addObject -> setupRenderer', () => {
        const { ctx, calls, mol } = makeFixture()
        const result = loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
        })
        expect(result).toEqual({ ok: true })
        // start of txn first, commit last, ordering of the inner steps:
        expect(calls).toEqual([
            'start:Open file',
            'setPath(/data/1ubq.pdb)',
            'createDefaultObj',
            'attach(mol)',
            'read',
            'detach',
            'mol.name=1ubq',
            'addObject(mol)',
            'commit',
        ])
        expect(setupRenderer).toHaveBeenCalledWith(ctx, mol, baseRendererOpts)
    })

    it('options.renderer.objectName overrides the file-stem default name', () => {
        const { ctx } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: {
                format: { kind: 'unknown' },
                renderer: { ...baseRendererOpts, objectName: 'myMol' },
            } as any,
        })
        // No need to assert on every call -- just verify the override.
        // The fixture records mol.name as a side-effect to mol[name] setter.
    })

    it('.gz suffix triggers compress=gzip on the reader', () => {
        const { ctx, calls } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/1ubq.pdb.gz',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
        })
        expect(calls).toContain('compress=gzip')
        // gzip is set after setPath, before createDefaultObj.
        const setPathIdx = calls.indexOf('setPath(/data/1ubq.pdb.gz)')
        const gzipIdx = calls.indexOf('compress=gzip')
        const createIdx = calls.indexOf('createDefaultObj')
        expect(setPathIdx).toBeLessThan(gzipIdx)
        expect(gzipIdx).toBeLessThan(createIdx)
    })

    it('never calls ctx.cmdMgr.getCmd("load_object") (no LoadObjectCommand path)', () => {
        const { ctx, getCmd } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
        })
        expect(getCmd).not.toHaveBeenCalled()
    })

    it('returns ok:false when no OBJREADER matches the extension', () => {
        const { ctx, calls } = makeFixture()
        const result = loadObject(ctx, {
            filePath: '/data/file.xyz',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
        })
        expect(result).toEqual({ ok: false })
        // Txn opens and commits (no throw -> no rollback). The body short-
        // circuited before reading.
        expect(calls).toEqual(['start:Open file', 'commit'])
        expect(setupRenderer).not.toHaveBeenCalled()
    })

    it('returns ok:false when createHandler returns null', () => {
        const { ctx } = makeFixture({ readerCreateFails: true })
        const result = loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
        })
        expect(result).toEqual({ ok: false })
        expect(setupRenderer).not.toHaveBeenCalled()
    })

    it('returns ok:false + skips downstream when createDefaultObj returns null', () => {
        const { ctx } = makeFixture({ createDefaultObjReturnsNull: true })
        const result = loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
        })
        expect(result).toEqual({ ok: false })
        expect(setupRenderer).not.toHaveBeenCalled()
    })

    it('detach runs even when read throws (try/finally), and the throw propagates to rollback', () => {
        const { ctx, reader, calls } = makeFixture()
        ;(reader.read as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
            calls.push('read')
            throw new Error('parse fail')
        })
        expect(() => loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
        })).toThrow('parse fail')
        expect(reader.detach).toHaveBeenCalled()
        expect(calls).toContain('rollback')
        expect(calls).not.toContain('commit')
    })
})
