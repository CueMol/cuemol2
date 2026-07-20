/**
 * Pins the animation branch of `renderStart`: AnimMgr is set up for offline
 * rendering, one frame is exported and queued at a time, each finished frame
 * lands in the output folder, and `stop()` -- which restores the scene
 * properties the animation overwrote -- runs on completion and on cancel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import type { RenderStartArgs } from '../worker/shared/renderTypes'
import type { PropDef } from '../data/rendererProperties'

const hoisted = vi.hoisted(() => ({
    getRenderBackend: vi.fn(),
    getAnimMgrOrNull: vi.fn(),
}))
vi.mock('../worker/server/services/renderBackends', () => ({
    getRenderBackend: hoisted.getRenderBackend,
}))
vi.mock('../worker/server/services/helpers/sceneResolver', () => ({
    getSceneOrNull: vi.fn(() => ({ __scene: true })),
}))
vi.mock('../worker/server/services/helpers/animResolve', () => ({
    getAnimMgrOrNull: hoisted.getAnimMgrOrNull,
}))

import { services } from '../worker/server/services/renderJob.service'

const p = (key: string, value: string | number | boolean): PropDef => ({
    key,
    label: key,
    type: 'real',
    value,
    group: 'g',
})

const PNG_BYTES = Buffer.from('test-frame-content')
const FRAME_COUNT = 3

describe('renderStart animation branch', () => {
    let outputDir: string
    let intervalCb: (() => void) | null
    let animMgr: {
        size: number
        length: { millisec: number }
        startcam: string
        setupRender: ReturnType<typeof vi.fn>
        writeFrame: ReturnType<typeof vi.fn>
        stop: ReturnType<typeof vi.fn>
    }
    let pushMessage: ReturnType<typeof vi.fn>
    let queueTask: ReturnType<typeof vi.fn>

    beforeEach(() => {
        outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-test-'))
        intervalCb = null
        vi.spyOn(globalThis, 'setInterval').mockImplementation(((cb: () => void) => {
            intervalCb = cb
            return 1 as never
        }) as never)
        vi.spyOn(globalThis, 'clearInterval').mockImplementation((() => {}) as never)

        animMgr = {
            size: 1,
            length: { millisec: 1000 },
            startcam: '',
            setupRender: vi.fn(() => FRAME_COUNT),
            writeFrame: vi.fn(),
            stop: vi.fn(),
        }
        hoisted.getAnimMgrOrNull.mockReturnValue(animMgr)

        queueTask = vi.fn(() => 1)
        pushMessage = vi.fn()

        // A backend that writes the frame PNG the pipeline then moves.
        hoisted.getRenderBackend.mockReturnValue({
            id: 'fake',
            exportScene: vi.fn(),
            exportAnimFrame: vi.fn(
                (
                    _ctx: unknown,
                    _scene: unknown,
                    mgr: { writeFrame: (e: unknown) => void },
                    _snap: unknown,
                    workDir: string,
                    frameIndex: number,
                ) => {
                    const frameDir = path.join(workDir, `f${frameIndex}`)
                    fs.mkdirSync(frameDir, { recursive: true })
                    fs.writeFileSync(path.join(frameDir, 'render.png'), PNG_BYTES)
                    mgr.writeFrame({ __exporter: true })
                    return {
                        inputPath: path.join(frameDir, 'render.pov'),
                        workDir: frameDir,
                        blendTable: {},
                    }
                },
            ),
            // Only render tasks, so one poll tick completes one frame.
            buildTasks: vi.fn(() => [
                { exe: process.execPath, args: '', kind: 'render' },
            ]),
            parseProgress: () => null,
            outputImagePath: (e: { workDir: string }) => path.join(e.workDir, 'render.png'),
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        fs.rmSync(outputDir, { recursive: true, force: true })
    })

    function makeCtx(): WorkerContext {
        const pm = {
            getSlotSize: () => 4,
            setSlotSize: vi.fn(),
            queueTask,
            // 0 = queued, 1 = running; anything else means ended.
            getTaskStatus: vi.fn(() => 2),
            getResultOutput: vi.fn(() => ''),
            kill: vi.fn(),
        }
        return {
            svc: {
                getService: (n: string) => (n === 'ProcessManager' ? pm : null),
                createObj: (n: string) => (n === 'TimeValue' ? { millisec: 0 } : null),
                pushMessage,
            },
        } as unknown as WorkerContext
    }

    function makeArgs(over: PropDef[] = []): RenderStartArgs {
        const base: PropDef[] = [
            p('outputDir', outputDir),
            p('baseName', 'movie'),
            p('fps', 30),
            p('dupLastFrame', true),
        ]
        // Replace by key -- the worker reads each prop with find(), so an
        // appended duplicate would never be seen.
        const animProps = base.map((b) => over.find((o) => o.key === b.key) ?? b)
        return {
            sceneId: 1,
            viewId: 2,
            snapshot: {
                mode: 'animation',
                backend: 'povray',
                commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
                backendProps: [],
                animProps,
            },
            binaries: { povrayExe: process.execPath, povrayInc: '', blendpng: process.execPath },
        }
    }

    it('sets up AnimMgr and queues only the first frame', () => {
        const res = services.renderStart(makeCtx(), makeArgs())

        expect(res.ok).toBe(true)
        expect(animMgr.setupRender).toHaveBeenCalledTimes(1)
        // A start camera is required; without it every frame uses a default one.
        expect(animMgr.startcam).toBe('__current')
        // Frame-at-a-time: only the first frame is written and queued up-front.
        expect(animMgr.writeFrame).toHaveBeenCalledTimes(1)
        expect(queueTask).toHaveBeenCalledTimes(1)
        expect(animMgr.stop).not.toHaveBeenCalled()
    })

    it('renders every frame, writes them to the output folder and stops the animation', () => {
        const ctx = makeCtx()
        const res = services.renderStart(ctx, makeArgs())
        expect(res.ok).toBe(true)

        // One poll tick completes one frame (the fake backend has no finalize task).
        for (let i = 0; i < FRAME_COUNT; i++) intervalCb?.()

        expect(animMgr.writeFrame).toHaveBeenCalledTimes(FRAME_COUNT)
        expect(animMgr.stop).toHaveBeenCalledTimes(1)

        const written = fs.readdirSync(outputDir).sort()
        expect(written).toEqual([
            'movie_frm_0000.png',
            'movie_frm_0001.png',
            'movie_frm_0002.png',
        ])

        const completes = pushMessage.mock.calls
            .map((c) => c[1] as { type: string })
            .filter((u) => u.type === 'complete')
        expect(completes).toHaveLength(1)
    })

    it('drops the last frame when dupLastFrame is off', () => {
        const ctx = makeCtx()
        services.renderStart(ctx, makeArgs([p('dupLastFrame', false)]))
        for (let i = 0; i < FRAME_COUNT; i++) intervalCb?.()

        expect(animMgr.writeFrame).toHaveBeenCalledTimes(FRAME_COUNT - 1)
        expect(fs.readdirSync(outputDir).sort()).toEqual([
            'movie_frm_0000.png',
            'movie_frm_0001.png',
        ])
    })

    it('stops the animation when the job is cancelled', () => {
        const ctx = makeCtx()
        const res = services.renderStart(ctx, makeArgs())
        intervalCb?.() // finish frame 0, start frame 1

        services.renderCancel(ctx, { jobId: res.jobId })

        expect(animMgr.stop).toHaveBeenCalledTimes(1)
    })

    it('fails before starting when the output folder is missing', () => {
        const args = makeArgs([p('outputDir', path.join(outputDir, 'does-not-exist'))])
        const res = services.renderStart(makeCtx(), args)

        expect(res.ok).toBe(false)
        expect(res.error).toContain('Output folder not found')
        expect(animMgr.setupRender).not.toHaveBeenCalled()
    })

    it('fails when the scene has no animation', () => {
        animMgr.size = 0
        const res = services.renderStart(makeCtx(), makeArgs())

        expect(res.ok).toBe(false)
        expect(res.error).toContain('no animation')
        expect(animMgr.setupRender).not.toHaveBeenCalled()
    })
})
