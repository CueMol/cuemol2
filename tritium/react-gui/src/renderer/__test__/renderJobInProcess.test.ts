/**
 * Pins the in-process branch of `renderStart`: an in-process backend (one that
 * defines `beginInProcess`) starts a background render and is driven by a poll
 * timer -- no ProcessManager task is queued, nothing is pushed synchronously
 * inside renderStart (which would lose the push to useRenderJob's jobId race),
 * progress updates are pushed while the render runs, and completion is emitted
 * only after the handle reports done and `finish()` writes the image.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import type { RenderStartArgs } from '../worker/shared/renderTypes'
import type { RenderSettingsSnapshot } from '../data/renderResult'
import type { PropDef } from '../data/rendererProperties'

const hoisted = vi.hoisted(() => ({ getRenderBackend: vi.fn() }))
vi.mock('../worker/server/services/renderBackends', () => ({
    getRenderBackend: hoisted.getRenderBackend,
}))
vi.mock('../worker/server/services/helpers/sceneResolver', () => ({
    getSceneOrNull: vi.fn(() => ({ __scene: true })),
}))

import { services } from '../worker/server/services/renderJob.service'

const p = (key: string, value: string | number | boolean): PropDef => ({
    key,
    label: key,
    type: 'real',
    value,
    group: 'g',
})

/** Any bytes -- finishJob only base64-encodes the file, it does not decode it. */
const PNG_BYTES = Buffer.from('test-png-content')

describe('renderStart in-process branch', () => {
    let outFile: string
    let intervalCb: (() => void) | null

    beforeEach(() => {
        outFile = path.join(os.tmpdir(), `umbreon-test-${Date.now()}-${Math.trunc(performance.now())}.png`)
        intervalCb = null
        // Capture the poll callback instead of running it on a real timer.
        vi.spyOn(globalThis, 'setInterval').mockImplementation(((cb: () => void) => {
            intervalCb = cb
            return 1 as never
        }) as never)
        vi.spyOn(globalThis, 'clearInterval').mockImplementation((() => {}) as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
        try {
            fs.rmSync(outFile, { force: true })
        } catch {
            /* ignore */
        }
    })

    function makeArgs(): RenderStartArgs {
        return {
            sceneId: 1,
            viewId: 2,
            snapshot: {
                mode: 'still',
                backend: 'umbreon',
                commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
                backendProps: [],
            } as RenderSettingsSnapshot,
            binaries: { povrayExe: '', povrayInc: '', blendpng: '', ffmpeg: '' },
        }
    }

    /** A fake in-process handle whose finish() writes the output PNG. */
    function makeHandle(overrides: Record<string, unknown> = {}) {
        return {
            progress: vi.fn(() => 0.5),
            phase: vi.fn(() => 'Primary'),
            isDone: vi.fn(() => false),
            finish: vi.fn(() => {
                fs.writeFileSync(outFile, PNG_BYTES)
                return false
            }),
            cancel: vi.fn(),
            ...overrides,
        }
    }

    function makeBackend(handle: ReturnType<typeof makeHandle>) {
        return {
            id: 'umbreon',
            exportScene: vi.fn((_c: unknown, _s: unknown, _snap: unknown, workDir: string) => ({
                inputPath: '',
                workDir,
                blendTable: {},
            })),
            outputImagePath: () => outFile,
            beginInProcess: vi.fn(() => handle),
            buildTasks: vi.fn(),
            parseProgress: () => null,
        }
    }

    it('starts the async render, queues no ProcessManager task, polls progress then completes', () => {
        const handle = makeHandle()
        const backend = makeBackend(handle)
        hoisted.getRenderBackend.mockReturnValue(backend)

        const pushMessage = vi.fn()
        const getService = vi.fn()
        const ctx = { svc: { pushMessage, getService } } as unknown as WorkerContext

        const res = services.renderStart(ctx, makeArgs())

        expect(res.ok).toBe(true)
        expect(res.jobId).toMatch(/^render-/)
        expect(backend.beginInProcess).toHaveBeenCalledTimes(1)
        expect(backend.beginInProcess).toHaveBeenCalledWith(ctx, expect.anything(), expect.anything(), outFile)
        expect(backend.buildTasks).not.toHaveBeenCalled()

        // No external-process path: ProcessManager never fetched, and nothing is
        // emitted synchronously (respects useRenderJob's jobId race).
        expect(getService).not.toHaveBeenCalled()
        expect(pushMessage).not.toHaveBeenCalled()
        expect(intervalCb).toBeTypeOf('function')

        // Tick 1: render still running -> a progress push.
        intervalCb!()
        expect(pushMessage).toHaveBeenCalledTimes(1)
        const [ch, prog] = pushMessage.mock.calls[0] as [string, Record<string, unknown>]
        expect(ch).toBe('render-progress')
        expect(prog.type).toBe('progress')
        expect(prog.jobId).toBe(res.jobId)
        expect(prog.progress).toBe(50) // 0.5 -> 50%
        expect(prog.phase).toBe('running')
        expect(handle.finish).not.toHaveBeenCalled()

        // Tick 2: render done -> finish() writes the PNG, then a complete push.
        handle.isDone.mockReturnValue(true)
        intervalCb!()
        expect(handle.finish).toHaveBeenCalledTimes(1)

        const complete = pushMessage.mock.calls.at(-1) as [string, Record<string, unknown>]
        expect(complete[1].type).toBe('complete')
        expect(complete[1].jobId).toBe(res.jobId)
        // The produced file is reported by path; it is archived by the main
        // process rather than inlined as a data URL.
        expect(complete[1].imagePath).toBe(outFile)
        expect(complete[1].imageDataUrl).toBeUndefined()
        expect(complete[1].width).toBe(640)
        expect(complete[1].height).toBe(480)
    })

    it('drops completion when the render was cancelled (no complete push)', () => {
        const handle = makeHandle({
            isDone: vi.fn(() => true),
            finish: vi.fn(() => true), // reports cancelled
        })
        const backend = makeBackend(handle)
        hoisted.getRenderBackend.mockReturnValue(backend)

        const pushMessage = vi.fn()
        const ctx = { svc: { pushMessage, getService: vi.fn() } } as unknown as WorkerContext

        const res = services.renderStart(ctx, makeArgs())
        expect(res.ok).toBe(true)

        // The done+cancelled tick calls finish() but emits neither progress nor
        // complete (the user cancellation was already reflected in the renderer).
        intervalCb!()
        expect(handle.finish).toHaveBeenCalledTimes(1)
        expect(pushMessage).not.toHaveBeenCalled()
    })

    it('reports an error when the in-process render fails to start (e.g. umbreon not built)', () => {
        const backend = {
            id: 'umbreon',
            exportScene: vi.fn((_c: unknown, _s: unknown, _snap: unknown, workDir: string) => ({
                inputPath: '',
                workDir,
                blendTable: {},
            })),
            outputImagePath: () => outFile,
            beginInProcess: vi.fn(() => {
                throw new Error('umbreon backend not compiled in')
            }),
            buildTasks: vi.fn(),
            parseProgress: () => null,
        }
        hoisted.getRenderBackend.mockReturnValue(backend)

        const ctx = {
            svc: { pushMessage: vi.fn(), getService: vi.fn() },
        } as unknown as WorkerContext

        const res = services.renderStart(ctx, makeArgs())
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/umbreon backend not compiled in/)
    })
})

/**
 * Shutdown cancellation. Renders started through the ProcessManager are
 * external processes (posix_spawn children), so they outlive the app unless
 * they are killed -- and their work directory is only registered for cleanup
 * once the job completes. Nothing was cancelling them when the window closed.
 */
describe('cancelAllRenderJobs', () => {
    let intervalCb: (() => void) | null

    beforeEach(() => {
        intervalCb = null
        vi.spyOn(globalThis, 'setInterval').mockImplementation(((cb: () => void) => {
            intervalCb = cb
            return 1 as never
        }) as never)
        vi.spyOn(globalThis, 'clearInterval').mockImplementation((() => {}) as never)
    })
    afterEach(() => vi.restoreAllMocks())

    function startInProcessJob(): { jobId: string; handle: ReturnType<typeof makeInProcHandle> } {
        const handle = makeInProcHandle()
        hoisted.getRenderBackend.mockReturnValue({
            id: 'umbreon',
            exportScene: vi.fn((_c: unknown, _s: unknown, _snap: unknown, workDir: string) => ({
                inputPath: '',
                workDir,
                blendTable: {},
            })),
            outputImagePath: () => '/tmp/never-written.png',
            beginInProcess: vi.fn(() => handle),
            buildTasks: vi.fn(),
            parseProgress: () => null,
        })
        const ctx = { svc: { pushMessage: vi.fn(), getService: vi.fn() } } as unknown as WorkerContext
        const res = services.renderStart(ctx, {
            sceneId: 1,
            viewId: 2,
            snapshot: {
                mode: 'still',
                backend: 'umbreon',
                commonProps: [
                    { key: 'width', label: 'w', type: 'real', value: 320, group: 'g' },
                    { key: 'height', label: 'h', type: 'real', value: 240, group: 'g' },
                    { key: 'unit', label: 'u', type: 'string', value: 'px', group: 'g' },
                    { key: 'dpi', label: 'd', type: 'real', value: 600, group: 'g' },
                ] as PropDef[],
                backendProps: [],
            } as RenderSettingsSnapshot,
            binaries: { povrayExe: '', povrayInc: '', blendpng: '', ffmpeg: '' },
        })
        if (!res.ok || !res.jobId) throw new Error('renderStart did not start a job')
        return { jobId: res.jobId, handle }
    }

    function makeInProcHandle() {
        return {
            progress: vi.fn(() => 0.1),
            phase: vi.fn(() => 'Primary'),
            isDone: vi.fn(() => false),
            finish: vi.fn(() => false),
            cancel: vi.fn(),
        }
    }

    it('cancels a running job and reports the count', async () => {
        const { handle } = startInProcessJob()
        expect(intervalCb).toBeTypeOf('function')

        const { cancelAllRenderJobs } = await import('../worker/server/services/renderJob.service')
        const ctx = { svc: { pushMessage: vi.fn(), getService: vi.fn() } } as unknown as WorkerContext

        expect(cancelAllRenderJobs(ctx)).toBe(1)
        // In-process renders are cancelled cooperatively (the poll loop then
        // joins the C++ thread); external ones are killed through ProcessManager.
        expect(handle.cancel).toHaveBeenCalledTimes(1)
    })

    it('keeps going when one job refuses to cancel', async () => {
        const bad = startInProcessJob()
        bad.handle.cancel.mockImplementation(() => {
            throw new Error('cancel blew up')
        })
        const good = startInProcessJob()
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const { cancelAllRenderJobs } = await import('../worker/server/services/renderJob.service')
        const ctx = { svc: { pushMessage: vi.fn(), getService: vi.fn() } } as unknown as WorkerContext
        expect(() => cancelAllRenderJobs(ctx)).not.toThrow()
        warn.mockRestore()

        // The second job is still cancelled: one failure must not strand the
        // rest, since each one may own an external process.
        expect(good.handle.cancel).toHaveBeenCalled()
    })
})
