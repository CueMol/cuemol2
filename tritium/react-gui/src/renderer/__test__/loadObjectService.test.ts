/**
 * Degrade-detection tests for `loadObject` (worker service).
 *
 * Pins the new LoadObjectCommand-based contract:
 *
 *   - `ctx.cmdMgr.getCmd('load_object')` is the entry point.
 *   - The scene is handed to the command via the `setTargetScene()`
 *     METHOD, not the `target_scene` PROPERTY setter (the latter routes
 *     through setPropHelper -> setupParentData, which clobbers the
 *     scene's parent linkage and breaks nested undo records).
 *   - `file_path`, `file_format` (empty -> guess), `object_name`, and
 *     `content_first` are assigned via property setters (these are safe
 *     because LScrObjBase::setupParentData is a no-op for non-object
 *     property values).
 *   - `cmd.run()` is invoked and `cmd.result_object` is read back as
 *     the freshly created object.
 *   - `setupRenderer(ctx, mol, options.renderer)` runs after a
 *     successful load.
 *
 * The new contract delegates *all* reader-picking, .gz transparent
 * decompression, default-name fallback, and scene.addObject() into the
 * C++ command body, so this test no longer pins step-by-step calls on
 * the reader or the scene.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

vi.mock('../worker/server/services/setupRenderer.service', () => ({
    setupRenderer: vi.fn(),
}))

import { services } from '../worker/server/services/loadObject.service'
import { setupRenderer } from '../worker/server/services/setupRenderer.service'

const { loadObject } = services

function makeFixture(opts: {
    runThrows?: boolean
    resultObjectNull?: boolean
    cmdMissing?: boolean
} = {}) {
    const calls: string[] = []

    const mol: Record<string, unknown> = {
        getClassName: () => 'MolCoord',
    }

    // Track which writes hit the command -- accessors record into `calls`.
    let filePath = ''
    let fileFormat = ''
    let objectName = ''
    let contentFirst = false

    const setTargetScene = vi.fn((s: unknown) => calls.push(`setTargetScene(${s ? 'scene' : 'null'})`))
    const run = vi.fn(() => {
        calls.push('run')
        if (opts.runThrows) throw new Error('parse fail')
    })

    const cmd: Record<string, unknown> = {
        setTargetScene,
        run,
    }
    Object.defineProperty(cmd, 'file_path', {
        get() { return filePath },
        set(v: string) { filePath = v; calls.push(`file_path=${v}`) },
    })
    Object.defineProperty(cmd, 'file_format', {
        get() { return fileFormat },
        set(v: string) { fileFormat = v; calls.push(`file_format=${v}`) },
    })
    Object.defineProperty(cmd, 'object_name', {
        get() { return objectName },
        set(v: string) { objectName = v; calls.push(`object_name=${v}`) },
    })
    Object.defineProperty(cmd, 'content_first', {
        get() { return contentFirst },
        set(v: boolean) { contentFirst = v; calls.push(`content_first=${v}`) },
    })
    Object.defineProperty(cmd, 'result_object', {
        get() {
            calls.push('result_object')
            return opts.resultObjectNull ? null : mol
        },
    })

    const scene = {
        startUndoTxn: vi.fn((label: string) => calls.push(`start:${label}`)),
        commitUndoTxn: vi.fn(() => calls.push('commit')),
        rollbackUndoTxn: vi.fn(() => calls.push('rollback')),
    }

    const getCmd = vi.fn(() => (opts.cmdMissing ? null : cmd))

    const ctx = {
        sceMgr: { getScene: vi.fn(() => scene) },
        cmdMgr: { getCmd },
        strMgr: {},
    } as unknown as WorkerContext

    return { ctx, scene, cmd, mol, calls, getCmd, setTargetScene, run }
}

const baseRendererOpts = {
    objectName: '',
    rendererType: 'simple',
    rendererName: 'simple1',
    selectionEnabled: false,
    selection: '*',
    centerView: false,
}

describe('loadObject.service — LoadObjectCommand path', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('happy path: setTargetScene method, then file_path / file_format / object_name / content_first / run / result_object / setupRenderer', () => {
        const { ctx, calls, mol } = makeFixture()
        const result = loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })
        expect(result).toEqual({ ok: true })
        expect(calls).toEqual([
            'start:Open file',
            'setTargetScene(scene)',
            'file_path=/data/1ubq.pdb',
            'file_format=',
            'object_name=',
            'content_first=false',
            'run',
            'result_object',
            'commit',
        ])
        expect(setupRenderer).toHaveBeenCalledWith(ctx, mol, baseRendererOpts)
    })

    it('content-first flag propagates to cmd.content_first', () => {
        const { ctx, calls } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/file.cif',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
            contentFirst: true,
        })
        expect(calls).toContain('content_first=true')
    })

    it('options.renderer.objectName flows into cmd.object_name', () => {
        const { ctx, calls } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: {
                format: { kind: 'unknown' },
                renderer: { ...baseRendererOpts, objectName: 'myMol' },
            } as any,
            contentFirst: false,
        })
        expect(calls).toContain('object_name=myMol')
    })

    it('scene is attached via setTargetScene METHOD (no `target_scene =` assignment exposed)', () => {
        const { ctx, setTargetScene, cmd } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })
        expect(setTargetScene).toHaveBeenCalledTimes(1)
        // The command must NOT expose target_scene as a writable accessor
        // here. (Production wrapper does, but on the property-setter path;
        // we ensure the service does not touch it.)
        expect(Object.prototype.hasOwnProperty.call(cmd, 'target_scene')).toBe(false)
    })

    it('cmd.file_format is left empty so guessFileFormat() picks the reader', () => {
        const { ctx, calls } = makeFixture()
        loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })
        expect(calls).toContain('file_format=')
    })

    it('returns ok:false when getCmd("load_object") returns null', () => {
        const { ctx } = makeFixture({ cmdMissing: true })
        const result = loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })
        expect(result).toEqual({ ok: false })
        expect(setupRenderer).not.toHaveBeenCalled()
    })

    it('returns ok:false when result_object is null', () => {
        const { ctx } = makeFixture({ resultObjectNull: true })
        const result = loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })
        expect(result).toEqual({ ok: false })
        expect(setupRenderer).not.toHaveBeenCalled()
    })

    it('cmd.run() throwing propagates and rolls back the undo txn', () => {
        const { ctx, calls } = makeFixture({ runThrows: true })
        expect(() => loadObject(ctx, {
            filePath: '/data/1ubq.pdb',
            sceneId: 1,
            options: { format: { kind: 'unknown' }, renderer: baseRendererOpts } as any,
            contentFirst: false,
        })).toThrow('parse fail')
        expect(calls).toContain('rollback')
        expect(calls).not.toContain('commit')
    })
})
