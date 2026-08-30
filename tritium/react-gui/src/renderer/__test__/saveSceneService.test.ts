import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '@renderer/worker/server/services/saveScene.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const { getSceneSaveInfo, saveScene } = services

interface SceneFixture {
    src: string
    name: string
    srctype: string
    saveViewToCam: ReturnType<typeof vi.fn>
    clearUndoData: ReturnType<typeof vi.fn>
    setName: ReturnType<typeof vi.fn>
}

interface WriterFixture {
    setDefaultOpts: ReturnType<typeof vi.fn>
    embedAllSetter: ReturnType<typeof vi.fn>
    compressSetter: ReturnType<typeof vi.fn>
    base64Setter: ReturnType<typeof vi.fn>
    versionSetter: ReturnType<typeof vi.fn>
    attach: ReturnType<typeof vi.fn>
    setPath: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    detach: ReturnType<typeof vi.fn>
    callOrder: string[]
}

function makeWriter(): WriterFixture {
    const callOrder: string[] = []
    const fx: WriterFixture = {
        setDefaultOpts: vi.fn(() => { callOrder.push('setDefaultOpts') }),
        embedAllSetter: vi.fn((v) => { callOrder.push(`embedAll=${v}`) }),
        compressSetter: vi.fn((v) => { callOrder.push(`compress=${v}`) }),
        base64Setter: vi.fn((v) => { callOrder.push(`base64=${v}`) }),
        versionSetter: vi.fn((v) => { callOrder.push(`version=${v}`) }),
        attach: vi.fn(() => { callOrder.push('attach') }),
        setPath: vi.fn((p) => { callOrder.push(`setPath=${p}`) }),
        write: vi.fn(() => { callOrder.push('write') }),
        detach: vi.fn(() => { callOrder.push('detach') }),
        callOrder,
    }
    return fx
}

function makeCtx(scene: SceneFixture | null, writerFx?: WriterFixture): {
    ctx: WorkerContext
    writer: WriterFixture | undefined
} {
    const writer = writerFx ?? makeWriter()
    const writerProxy = writer && {
        setDefaultOpts: writer.setDefaultOpts,
        set embedAll(v: boolean) { writer.embedAllSetter(v) },
        set compress(v: number) { writer.compressSetter(v) },
        set base64(v: boolean) { writer.base64Setter(v) },
        set version(v: string) { writer.versionSetter(v) },
        attach: writer.attach,
        setPath: writer.setPath,
        write: writer.write,
        detach: writer.detach,
    }
    const ctx = {
        sceMgr: { getScene: vi.fn(() => scene) },
        strMgr: { createHandler: vi.fn(() => writerProxy) },
    } as unknown as WorkerContext
    return { ctx, writer }
}

function makeScene(overrides: Partial<SceneFixture> = {}): SceneFixture {
    return {
        src: '',
        name: 'untitled',
        srctype: '',
        saveViewToCam: vi.fn(),
        clearUndoData: vi.fn(),
        setName: vi.fn(),
        ...overrides,
    }
}

describe('saveScene.service', () => {
    beforeEach(() => { vi.clearAllMocks() })

    describe('getSceneSaveInfo', () => {
        it('returns the scene src/name/srctype when the scene resolves', () => {
            const scene = makeScene({ src: '/tmp/a.qsc', name: 'a.qsc', srctype: 'qsc_xml' })
            const { ctx } = makeCtx(scene)
            expect(getSceneSaveInfo(ctx, { sceneId: 5 })).toEqual({
                ok: true, src: '/tmp/a.qsc', name: 'a.qsc', srctype: 'qsc_xml',
            })
        })

        it('returns ok:false when the scene id is not registered', () => {
            const { ctx } = makeCtx(null)
            expect(getSceneSaveInfo(ctx, { sceneId: 99 })).toEqual({
                ok: false, src: '', name: '', srctype: '',
            })
        })
    })

    describe('saveScene', () => {
        it('runs the qsc_xml writer in attach -> setPath -> write -> detach order, then renames the scene', () => {
            const scene = makeScene()
            const { ctx, writer } = makeCtx(scene)
            const result = saveScene(ctx, {
                sceneId: 1, viewId: 7, filePath: '/tmp/out.qsc',
            })
            expect(result).toEqual({ ok: true })

            expect((ctx.strMgr.createHandler as ReturnType<typeof vi.fn>))
                .toHaveBeenCalledWith('qsc_xml', 4)
            expect(scene.saveViewToCam).toHaveBeenCalledWith(7, '__current')

            // The writer wiring must run setDefaultOpts before any optional
            // setters (none here), then attach -> setPath -> write -> detach.
            expect(writer!.callOrder).toEqual([
                'setDefaultOpts',
                'attach',
                'setPath=/tmp/out.qsc',
                'write',
                'detach',
            ])

            // Post-write housekeeping: drop undo data, rename to leaf path.
            expect(scene.clearUndoData).toHaveBeenCalledTimes(1)
            expect(scene.setName).toHaveBeenCalledWith('out.qsc')
        })

        it('forwards each option through the typed setter (compress is cast)', () => {
            const scene = makeScene()
            const { ctx, writer } = makeCtx(scene)
            saveScene(ctx, {
                sceneId: 1, viewId: 7, filePath: '/tmp/out.qsc',
                options: { embedAll: true, compress: 'gzip', base64: false, version: 'QDF1' },
            })
            expect(writer!.embedAllSetter).toHaveBeenCalledWith(true)
            expect(writer!.compressSetter).toHaveBeenCalledWith('gzip')
            expect(writer!.base64Setter).toHaveBeenCalledWith(false)
            expect(writer!.versionSetter).toHaveBeenCalledWith('QDF1')

            // Setters must run AFTER setDefaultOpts and BEFORE attach.
            const order = writer!.callOrder
            const idxDefaults = order.indexOf('setDefaultOpts')
            const idxAttach = order.indexOf('attach')
            const idxEmbed = order.indexOf('embedAll=true')
            expect(idxDefaults).toBeLessThan(idxEmbed)
            expect(idxEmbed).toBeLessThan(idxAttach)
        })

        it('does not throw when saveViewToCam fails (UXP parity)', () => {
            const scene = makeScene({
                saveViewToCam: vi.fn(() => { throw new Error('no view') }),
            })
            const { ctx } = makeCtx(scene)
            expect(() => saveScene(ctx, {
                sceneId: 1, viewId: 7, filePath: '/tmp/out.qsc',
            })).not.toThrow()
        })

        it('returns ok:false when the scene id is not registered', () => {
            const { ctx, writer } = makeCtx(null)
            const result = saveScene(ctx, {
                sceneId: 99, viewId: 0, filePath: '/tmp/x.qsc',
            })
            expect(result).toEqual({ ok: false })
            expect(writer!.callOrder).toEqual([])
        })
    })
})
