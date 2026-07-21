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
import type { MovieSettings } from '../data/renderSettings'

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

    function makeArgs(over: Partial<MovieSettings> = {}): RenderStartArgs {
        return {
            sceneId: 1,
            viewId: 2,
            snapshot: {
                mode: 'movie',
                backend: 'povray',
                commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
                backendProps: [],
                movie: {
                    outputDir,
                    baseName: 'movie',
                    fps: 30,
                    makeMovie: false,
                    movieFormat: 'mp4_h264',
                    dupLastFrame: true,
                    bitrateKbps: 1024,
                    ...over,
                },
            },
            binaries: { povrayExe: process.execPath, povrayInc: '', blendpng: process.execPath, ffmpeg: process.execPath },
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
            .map((c) => c[1] as { type: string; movie?: unknown })
            .filter((u) => u.type === 'complete')
        expect(completes).toHaveLength(1)
        // The result carries where the frames landed, so the viewer can read
        // them back one at a time for its frame slider.
        expect(completes[0].movie).toEqual({
            frameCount: FRAME_COUNT,
            outputDir,
            baseName: 'movie',
        })
    })

    it('encodes a movie with ffmpeg after the frames when makeMovie is on', () => {
        const ctx = makeCtx()
        services.renderStart(ctx, makeArgs({ makeMovie: true }))
        // FRAME_COUNT ticks render the frames; one more polls the encode task.
        for (let i = 0; i < FRAME_COUNT + 1; i++) intervalCb?.()

        // One ffmpeg task queued after the per-frame render tasks.
        expect(queueTask).toHaveBeenCalledTimes(FRAME_COUNT + 1)
        const encodeArgs = queueTask.mock.calls[queueTask.mock.calls.length - 1][1] as string
        expect(encodeArgs).toContain('movie_frm_%04d.png')

        const complete = pushMessage.mock.calls
            .map((c) => c[1] as { type: string; movie?: { moviePath?: string } })
            .find((u) => u.type === 'complete')
        expect(complete?.movie?.moviePath).toContain('movie.mp4')
        expect(animMgr.stop).toHaveBeenCalledTimes(1)
    })

    it('does not encode when makeMovie is off (no ffmpeg task)', () => {
        const ctx = makeCtx()
        services.renderStart(ctx, makeArgs({ makeMovie: false }))
        for (let i = 0; i < FRAME_COUNT + 1; i++) intervalCb?.()
        // Only the FRAME_COUNT render tasks; no ffmpeg task.
        expect(queueTask).toHaveBeenCalledTimes(FRAME_COUNT)
    })

    it('reports whole-job progress, not the current frame alone', () => {
        const ctx = makeCtx()
        services.renderStart(ctx, makeArgs())
        intervalCb?.() // frame 0 finishes, frame 1 is queued

        const last = pushMessage.mock.calls
            .map((c) => c[1] as {
                type: string
                progress?: number
                frameIndex?: number
                frameCount?: number
                frameProgress?: number
            })
            .filter((u) => u.type === 'progress')
            .pop()

        // One of three frames is done, so the job is a third of the way in --
        // it does not fall back to 0% just because a new frame started.
        expect(last?.progress).toBe(Math.round((1 / FRAME_COUNT) * 100))
        expect(last?.frameIndex).toBe(1)
        expect(last?.frameCount).toBe(FRAME_COUNT)
        expect(last?.frameProgress).toBe(0)
    })

    it('previews finished frames, rate-limited and excluding the last', () => {
        const ctx = makeCtx()
        services.renderStart(ctx, makeArgs())
        for (let i = 0; i < FRAME_COUNT; i++) intervalCb?.()

        const previews = pushMessage.mock.calls
            .map((c) => c[1] as { type: string; frameIndex?: number })
            .filter((u) => u.type === 'framePreview')

        // Every frame finishes within the same second here, so the rate limit
        // lets only the first through; the last frame is never previewed
        // because it is reported as the result image instead.
        expect(previews).toHaveLength(1)
        expect(previews[0].frameIndex).toBe(0)
    })

    it('drops the last frame when dupLastFrame is off', () => {
        const ctx = makeCtx()
        services.renderStart(ctx, makeArgs({ dupLastFrame: false }))
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
        const args = makeArgs({ outputDir: path.join(outputDir, 'does-not-exist') })
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
