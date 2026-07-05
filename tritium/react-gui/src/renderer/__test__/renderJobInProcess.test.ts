/**
 * Pins the in-process branch of `renderStart`: an in-process backend (one that
 * defines `renderInProcess`) renders synchronously, no ProcessManager task is
 * queued, and the completion push is DEFERRED to a later macrotask (setTimeout)
 * -- never emitted synchronously inside renderStart, which would lose the push
 * to useRenderJob's jobId race.
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
    let timerCb: (() => void) | null

    beforeEach(() => {
        outFile = path.join(os.tmpdir(), `umbreon-test-${Date.now()}-${Math.trunc(performance.now())}.png`)
        timerCb = null
        vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
            timerCb = cb
            return 0 as never
        }) as never)
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
                backend: 'umbreon',
                commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
                backendProps: [],
            } as RenderSettingsSnapshot,
            binaries: { povrayExe: '', povrayInc: '', blendpng: '' },
        }
    }

    it('renders in-process, queues no ProcessManager task, defers completion', () => {
        const renderInProcess = vi.fn((_c: unknown, _s: unknown, _snap: unknown, out: string) => {
            fs.writeFileSync(out, PNG_BYTES)
        })
        const buildTasks = vi.fn()
        const fakeBackend = {
            id: 'umbreon',
            exportScene: vi.fn((_c: unknown, _s: unknown, _snap: unknown, workDir: string) => ({
                inputPath: '',
                workDir,
                blendTable: {},
            })),
            outputImagePath: () => outFile,
            renderInProcess,
            buildTasks,
            parseProgress: () => null,
        }
        hoisted.getRenderBackend.mockReturnValue(fakeBackend)

        const pushMessage = vi.fn()
        const getService = vi.fn()
        const ctx = { svc: { pushMessage, getService } } as unknown as WorkerContext

        const res = services.renderStart(ctx, makeArgs())

        expect(res.ok).toBe(true)
        expect(res.jobId).toMatch(/^render-/)
        expect(renderInProcess).toHaveBeenCalledTimes(1)
        expect(renderInProcess).toHaveBeenCalledWith(ctx, expect.anything(), expect.anything(), outFile)
        expect(buildTasks).not.toHaveBeenCalled()

        // No external-process path: ProcessManager never fetched, and completion
        // is NOT emitted synchronously (respects useRenderJob's jobId race).
        expect(getService).not.toHaveBeenCalled()
        expect(pushMessage).not.toHaveBeenCalled()

        // The deferred macrotask reads the PNG and emits completion.
        expect(timerCb).toBeTypeOf('function')
        timerCb!()

        expect(pushMessage).toHaveBeenCalledTimes(1)
        const [channel, update] = pushMessage.mock.calls[0] as [string, Record<string, unknown>]
        expect(channel).toBe('render-progress')
        expect(update.type).toBe('complete')
        expect(update.jobId).toBe(res.jobId)
        expect(String(update.imageDataUrl)).toMatch(/^data:image\/png;base64,/)
        expect(update.width).toBe(640)
        expect(update.height).toBe(480)
    })

    it('reports an error when the in-process render throws (e.g. umbreon not built)', () => {
        const fakeBackend = {
            id: 'umbreon',
            exportScene: vi.fn((_c: unknown, _s: unknown, _snap: unknown, workDir: string) => ({
                inputPath: '',
                workDir,
                blendTable: {},
            })),
            outputImagePath: () => outFile,
            renderInProcess: vi.fn(() => {
                throw new Error('umbreon backend not compiled in')
            }),
            buildTasks: vi.fn(),
            parseProgress: () => null,
        }
        hoisted.getRenderBackend.mockReturnValue(fakeBackend)

        const ctx = {
            svc: { pushMessage: vi.fn(), getService: vi.fn() },
        } as unknown as WorkerContext

        const res = services.renderStart(ctx, makeArgs())
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/umbreon backend not compiled in/)
    })
})
