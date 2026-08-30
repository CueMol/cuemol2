/**
 * Degrade-detection tests for `loadObject` (worker service).
 *
 * Pins the reader-based load contract (replaces the old LoadObjectCommand
 * path), mirroring UXP fileOpenHelper1 (uxp_gui/.../fileopen.js):
 *
 *   - pickReaderName(ctx, path, contentFirst) resolves the reader nickname.
 *     '' (no match) -> ok:false, no scene mutation.
 *   - ctx.strMgr.createHandler(nickname, 0) creates the reader.
 *   - reader.setPath(path); '.gz' -> reader.compress = 'gzip'.
 *   - applyReaderOptions(reader, nickname, format) wires format options
 *     BEFORE read() (the whole point of dropping LoadObjectCommand).
 *   - inside the undo txn: createDefaultObj -> attach -> read -> detach ->
 *     name -> scene.addObject -> setupRenderer.
 *   - read() throwing rolls back the undo txn (no commit).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/rend/setupRenderer', () => ({
    setupRenderer: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/helpers/pickReaderName', () => ({
    pickReaderName: vi.fn(() => 'pdb'),
    OBJREADER_CATEGORY: 0,
}))
vi.mock('@renderer/worker/server/services/helpers/applyReaderOptions', () => ({
    applyReaderOptions: vi.fn(),
}))

import { services } from '@renderer/worker/server/services/file/file.service'
import { setupRenderer } from '@renderer/worker/server/services/rend/setupRenderer'
import { pickReaderName } from '@renderer/worker/server/services/helpers/pickReaderName'
import { applyReaderOptions } from '@renderer/worker/server/services/helpers/applyReaderOptions'

const { loadObject } = services

function makeFixture(opts: { readThrows?: boolean } = {}) {
    const calls: string[] = []

    const obj: Record<string, unknown> = { __obj: true }
    Object.defineProperty(obj, 'name', {
        set(v: string) { calls.push(`name=${v}`) },
        configurable: true,
    })

    let compress = ''
    const reader: Record<string, unknown> = {
        setPath: vi.fn((p: string) => calls.push(`setPath=${p}`)),
        createDefaultObj: vi.fn(() => { calls.push('createDefaultObj'); return obj }),
        attach: vi.fn(() => calls.push('attach')),
        read: vi.fn(() => {
            calls.push('read')
            if (opts.readThrows) throw new Error('parse fail')
        }),
        detach: vi.fn(() => calls.push('detach')),
    }
    Object.defineProperty(reader, 'compress', {
        get() { return compress },
        set(v: string) { compress = v; calls.push(`compress=${v}`) },
    })

    const scene = {
        startUndoTxn: vi.fn((label: string) => calls.push(`start:${label}`)),
        commitUndoTxn: vi.fn(() => calls.push('commit')),
        rollbackUndoTxn: vi.fn(() => calls.push('rollback')),
        addObject: vi.fn(() => calls.push('addObject')),
    }

    const createHandler = vi.fn(() => reader)

    const ctx = {
        sceMgr: { getScene: vi.fn(() => scene) },
        strMgr: { createHandler },
    } as unknown as WorkerContext

    return { ctx, scene, reader, obj, calls, createHandler }
}

const baseRendererOpts = {
    objectName: '',
    rendererType: 'simple',
    rendererName: 'simple1',
    selectionEnabled: false,
    selection: '*',
    centerView: false,
}

const unknownFormat = { kind: 'unknown', options: {} } as const

describe('loadObject.service — reader-based path', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        ;(pickReaderName as ReturnType<typeof vi.fn>).mockReturnValue('pdb')
    })

    it('happy path: setPath -> applyReaderOptions -> createDefaultObj/attach/read/detach -> name -> addObject -> setupRenderer (in txn)', () => {
        const { ctx, calls, obj, createHandler } = makeFixture()
        const result = loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: unknownFormat, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })
        expect(result).toEqual({ ok: true })
        expect(createHandler).toHaveBeenCalledWith('pdb', 0)
        expect(calls).toEqual([
            'setPath=/data/1ubq.pdb',
            'start:Open file',
            'createDefaultObj',
            'attach',
            'read',
            'detach',
            'name=1ubq',          // objectName empty -> file stem
            'addObject',
            'commit',
        ])
        expect(applyReaderOptions).toHaveBeenCalledWith(expect.anything(), 'pdb', unknownFormat)
        expect(setupRenderer).toHaveBeenCalledWith(ctx, obj, baseRendererOpts)
    })

    it('.gz path: sets reader.compress = "gzip"', () => {
        const { ctx, calls } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/1ubq.pdb.gz',
            sceneId: 1,
            options: { format: unknownFormat, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })
        expect(calls).toContain('compress=gzip')
    })

    it('non-.gz path: does NOT set compress', () => {
        const { ctx, calls } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: unknownFormat, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })
        expect(calls).not.toContain('compress=gzip')
    })

    it('objectName from renderer options overrides the file stem', () => {
        const { ctx, calls } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: {
                format: unknownFormat,
                renderer: { ...baseRendererOpts, objectName: 'myMol' },
            } as any,
            contentFirst: false,
        })
        expect(calls).toContain('name=myMol')
        expect(calls).not.toContain('name=1ubq')
    })

    it('contentFirst flag is forwarded to pickReaderName', () => {
        const { ctx } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/file',
            sceneId: 1,
            options: { format: unknownFormat, renderer: baseRendererOpts } as any,
            contentFirst: true,
        })
        expect(pickReaderName).toHaveBeenCalledWith(ctx, '/data/file', true, undefined)
    })

    it('explicit readerName bypasses pickReaderName and is used to create the reader', () => {
        const { ctx, createHandler } = makeFixture()
        const result = loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: unknownFormat, renderer: baseRendererOpts } as any,
            contentFirst: false,
            readerName: 'pdb',
        })
        expect(result).toEqual({ ok: true })
        expect(pickReaderName).not.toHaveBeenCalled()
        expect(createHandler).toHaveBeenCalledWith('pdb', 0)
    })

    it('returns ok:false when no reader matches (pickReaderName -> "")', () => {
        const { ctx, createHandler } = makeFixture()
        ;(pickReaderName as ReturnType<typeof vi.fn>).mockReturnValue('')
        const result = loadObject(ctx, {
            filePath: '/data/mystery',
            sceneId: 1,
            options: { format: unknownFormat, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })
        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'unsupported' }))
        expect(createHandler).not.toHaveBeenCalled()
        expect(setupRenderer).not.toHaveBeenCalled()
    })

    it('read() throwing rolls back the undo txn and comes back as an io failure', () => {
        const { ctx, calls } = makeFixture({ readThrows: true })
        // Used to escape as a throw -- a rejected promise on the renderer side.
        const result = loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: unknownFormat, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })
        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'io', error: 'parse fail' }))
        expect(calls).toContain('rollback')
        expect(calls).not.toContain('commit')
        expect(calls).not.toContain('addObject')
        expect(setupRenderer).not.toHaveBeenCalled()
    })
})
