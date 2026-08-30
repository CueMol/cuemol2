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
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { RenderStartArgs } from '@renderer/worker/shared/renderTypes'
import type { PropDef } from '@renderer/data/rendererProperties'
import type { MovieSettings } from '@renderer/data/renderSettings'

const hoisted = vi.hoisted(() => ({
    getRenderBackend: vi.fn(),
    getAnimMgrOrNull: vi.fn(),
    /** Cameras the fake scene holds, by name. */
    cameras: new Set<string>(),
}))
vi.mock('@renderer/worker/server/services/renderjob/backends', () => ({
    getRenderBackend: hoisted.getRenderBackend,
}))
vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
    getSceneOrNull: vi.fn(() => ({
        __scene: true,
        hasCamera: (name: string) => hoisted.cameras.has(name),
        // renderStart captures the render target's view into "__current".
        saveViewToCam: (_viewId: number, name: string) => {
            hoisted.cameras.add(name)
            return true
        },
    })),
}))
vi.mock('@renderer/worker/server/services/anim/resolve', () => ({
    getAnimMgrOrNull: hoisted.getAnimMgrOrNull,
}))

import { services } from '@renderer/worker/server/services/renderjob/renderJob.service'

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
    /**
     * Whether the fake ffmpeg task writes its output file. The pipeline reads
     * the file's presence as the encode's verdict (ProcessManager reports no
     * exit code), so turning this off is how a failed encode is simulated.
     */
    let encodeWritesMovie: boolean

    beforeEach(() => {
        outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-test-'))
        hoisted.cameras.clear()
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

        encodeWritesMovie = true
        queueTask = vi.fn((_exe: string, args: string) => {
            // The ffmpeg command ends with its quoted output path; a real
            // encode produces that file.
            const m = /"([^"]+)"\s*$/.exec(args)
            if (encodeWritesMovie && m && /\.(mp4|mov|wmv|gif)$/.test(m[1])) {
                fs.writeFileSync(m[1], 'movie-bytes')
            }
            return 1
        })
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
                    useTempDir: false,
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

    // `startcam` is the Animation panel's setting and persisted scene state,
    // not a render option: the render must honour it and must not rewrite it.
    describe('start camera', () => {
        /** The name AnimMgr held while the frames were being set up. */
        function startCamDuringSetup(): string {
            expect(animMgr.setupRender).toHaveBeenCalledTimes(1)
            return setupStartCam
        }
        let setupStartCam: string

        beforeEach(() => {
            setupStartCam = ''
            animMgr.setupRender = vi.fn(() => {
                setupStartCam = animMgr.startcam
                return FRAME_COUNT
            })
        })

        it('renders from the camera chosen in the Animation panel', () => {
            hoisted.cameras.add('front')
            animMgr.startcam = 'front'

            const ctx = makeCtx()
            services.renderStart(ctx, makeArgs())
            for (let i = 0; i < FRAME_COUNT; i++) intervalCb?.()

            expect(startCamDuringSetup()).toBe('front')
            expect(animMgr.startcam).toBe('front')
        })

        it('falls back to the captured view when none is set, then puts it back', () => {
            animMgr.startcam = ''

            const ctx = makeCtx()
            services.renderStart(ctx, makeArgs())

            expect(startCamDuringSetup()).toBe('__current')
            for (let i = 0; i < FRAME_COUNT; i++) intervalCb?.()
            expect(animMgr.startcam).toBe('')
        })

        it('stands in for a camera the scene no longer has, keeping the name', () => {
            animMgr.startcam = 'deleted-cam'

            const ctx = makeCtx()
            services.renderStart(ctx, makeArgs())

            expect(startCamDuringSetup()).toBe('__current')
            for (let i = 0; i < FRAME_COUNT; i++) intervalCb?.()
            expect(animMgr.startcam).toBe('deleted-cam')
        })

        it('restores the start camera when the job is cancelled', () => {
            animMgr.startcam = ''

            const ctx = makeCtx()
            const res = services.renderStart(ctx, makeArgs())
            intervalCb?.()
            services.renderCancel(ctx, { jobId: res.jobId })

            expect(animMgr.startcam).toBe('')
        })

        it('restores the start camera when the setup fails', () => {
            animMgr.startcam = ''
            animMgr.setupRender = vi.fn(() => {
                throw new Error('setup failed')
            })

            const res = services.renderStart(makeCtx(), makeArgs())

            expect(res.ok).toBe(false)
            expect(animMgr.startcam).toBe('')
        })
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

    // An earlier, longer render's frames would otherwise survive past this
    // sequence's end, where they inflate the re-encode count and can make
    // ffmpeg abort on a size change partway through the pattern.
    it('clears an earlier render of the same base name before starting', () => {
        for (let i = 0; i < 9; i++) {
            fs.writeFileSync(path.join(outputDir, `movie_frm_000${i}.png`), PNG_BYTES)
        }
        fs.writeFileSync(path.join(outputDir, 'movie.mp4'), 'old-movie')
        // A different base name and an unrelated file are not this render's.
        fs.writeFileSync(path.join(outputDir, 'other_frm_0000.png'), PNG_BYTES)
        fs.writeFileSync(path.join(outputDir, 'notes.txt'), 'keep me')

        const ctx = makeCtx()
        services.renderStart(ctx, makeArgs())
        for (let i = 0; i < FRAME_COUNT; i++) intervalCb?.()

        expect(fs.readdirSync(outputDir).sort()).toEqual([
            'movie_frm_0000.png',
            'movie_frm_0001.png',
            'movie_frm_0002.png',
            'notes.txt',
            'other_frm_0000.png',
        ])
    })

    it('fails before rendering a frame when ffmpeg is missing', () => {
        const args = makeArgs({ makeMovie: true })
        args.binaries = { ...args.binaries, ffmpeg: path.join(outputDir, 'no-such-ffmpeg') }

        const res = services.renderStart(makeCtx(), args)

        expect(res.ok).toBe(false)
        expect(res.error).toContain('ffmpeg not found')
        // The whole point: nothing was rendered before the failure.
        expect(animMgr.writeFrame).not.toHaveBeenCalled()
        expect(queueTask).not.toHaveBeenCalled()
    })

    it('fails before rendering a frame when no ffmpeg is configured', () => {
        const args = makeArgs({ makeMovie: true })
        args.binaries = { ...args.binaries, ffmpeg: '' }

        const res = services.renderStart(makeCtx(), args)

        expect(res.ok).toBe(false)
        expect(res.error).toContain('No ffmpeg executable is configured')
        expect(animMgr.writeFrame).not.toHaveBeenCalled()
    })

    it('renders the frames without ffmpeg when makeMovie is off', () => {
        const args = makeArgs({ makeMovie: false })
        args.binaries = { ...args.binaries, ffmpeg: '' }

        const res = services.renderStart(makeCtx(), args)

        expect(res.ok).toBe(true)
    })

    // ProcessManager exposes no exit code, so a failed encode used to end as a
    // success -- and with an earlier movie still at that path, the window
    // offered that one as the result.
    it('reports an error when the encode produces no movie file', () => {
        encodeWritesMovie = false
        fs.writeFileSync(path.join(outputDir, 'movie.mp4'), 'stale-movie')

        const ctx = makeCtx()
        services.renderStart(ctx, makeArgs({ makeMovie: true }))
        for (let i = 0; i < FRAME_COUNT + 1; i++) intervalCb?.()

        const updates = pushMessage.mock.calls.map(
            (c) => c[1] as { type: string; error?: string },
        )
        expect(updates.find((u) => u.type === 'complete')).toBeUndefined()
        expect(updates.find((u) => u.type === 'error')?.error).toContain(
            'could not be encoded',
        )
        // The stale movie was cleared before the encode, so nothing can pass
        // for this render's output.
        expect(fs.existsSync(path.join(outputDir, 'movie.mp4'))).toBe(false)
        expect(animMgr.stop).toHaveBeenCalledTimes(1)
    })

    describe('re-encode only', () => {
        function encodeArgs(frameCount: number): RenderStartArgs {
            const a = makeArgs({ makeMovie: true })
            return { ...a, encodeOnly: { frameCount } }
        }

        it('encodes existing frames without rendering', () => {
            // Frames already on disk.
            for (let i = 0; i < 3; i++) {
                fs.writeFileSync(
                    path.join(outputDir, `movie_frm_000${i}.png`),
                    PNG_BYTES,
                )
            }
            const ctx = makeCtx()
            const res = services.renderStart(ctx, encodeArgs(3))
            expect(res.ok).toBe(true)
            // No scene setup and no frame rendering happened.
            expect(animMgr.setupRender).not.toHaveBeenCalled()
            expect(animMgr.writeFrame).not.toHaveBeenCalled()
            // One ffmpeg task queued straight away.
            expect(queueTask).toHaveBeenCalledTimes(1)
            expect(queueTask.mock.calls[0][1]).toContain('movie_frm_%04d.png')

            // Poll once: the encode task ends, the job completes with the movie.
            intervalCb?.()
            const complete = pushMessage.mock.calls
                .map((c) => c[1] as { type: string; movie?: { moviePath?: string } })
                .find((u) => u.type === 'complete')
            expect(complete?.movie?.moviePath).toContain('movie.mp4')
        })

        it('rejects a zero frame count', () => {
            const res = services.renderStart(makeCtx(), encodeArgs(0))
            expect(res.ok).toBe(false)
        })
    })

    // An in-process backend (umbreon) renders each frame on a background C++
    // thread instead of spawning a process, so the frame loop is driven by the
    // poll handle rather than by ProcessManager tasks.
    describe('in-process backend', () => {
        /** One frame's handle; `done` flips when the test says the frame ended. */
        function makeHandle(onFinish: () => void) {
            const h = {
                done: false,
                progress: vi.fn(() => 0.5),
                phase: vi.fn(() => 'Primary'),
                isDone: vi.fn(() => h.done),
                finish: vi.fn(() => {
                    onFinish()
                    return false
                }),
                cancel: vi.fn(() => {
                    h.done = true
                }),
            }
            return h
        }

        let handles: ReturnType<typeof makeHandle>[]

        beforeEach(() => {
            handles = []
            hoisted.getRenderBackend.mockReturnValue({
                id: 'umbreon',
                exportScene: vi.fn(),
                outputImagePath: vi.fn(),
                // No exportAnimFrame / buildTasks: this backend renders frames
                // in-process only.
                buildTasks: vi.fn(),
                parseProgress: () => null,
                beginInProcessAnimFrame: vi.fn(
                    (
                        _ctx: unknown,
                        _mgr: unknown,
                        _snap: unknown,
                        outputPath: string,
                    ) => {
                        // finish() writes the frame PNG the pipeline then moves.
                        const h = makeHandle(() => fs.writeFileSync(outputPath, PNG_BYTES))
                        handles.push(h)
                        return h
                    },
                ),
            })
        })

        /** Run the frame currently in flight to completion. */
        function finishCurrentFrame(): void {
            handles[handles.length - 1].done = true
            intervalCb?.()
        }

        it('renders every frame through the handle without queueing any task', () => {
            const ctx = makeCtx()
            const res = services.renderStart(ctx, makeArgs())
            expect(res.ok).toBe(true)

            // Only the first frame starts up-front, and no blocking writeFrame.
            expect(handles).toHaveLength(1)
            expect(animMgr.writeFrame).not.toHaveBeenCalled()

            for (let i = 0; i < FRAME_COUNT; i++) finishCurrentFrame()

            expect(handles).toHaveLength(FRAME_COUNT)
            expect(handles.every((h) => h.finish.mock.calls.length === 1)).toBe(true)
            // In-process: the external-process path is never touched.
            expect(queueTask).not.toHaveBeenCalled()

            expect(fs.readdirSync(outputDir).sort()).toEqual([
                'movie_frm_0000.png',
                'movie_frm_0001.png',
                'movie_frm_0002.png',
            ])
            // The scene properties the animation overwrote are restored.
            expect(animMgr.stop).toHaveBeenCalledTimes(1)
        })

        it('reports the frame progress as a share of the whole job', () => {
            const ctx = makeCtx()
            services.renderStart(ctx, makeArgs())

            intervalCb?.() // frame 0 still running, 50% through

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

            expect(last?.frameIndex).toBe(0)
            expect(last?.frameCount).toBe(FRAME_COUNT)
            expect(last?.frameProgress).toBe(50)
            // Half of one of three frames.
            expect(last?.progress).toBe(Math.round((0.5 / FRAME_COUNT) * 100))
        })

        it('cancels cooperatively and still stops the animation', () => {
            const ctx = makeCtx()
            const res = services.renderStart(ctx, makeArgs())
            finishCurrentFrame() // frame 0 done, frame 1 in flight

            services.renderCancel(ctx, { jobId: res.jobId })
            // The running render is asked to stop rather than killed outright.
            expect(handles[1].cancel).toHaveBeenCalledTimes(1)
            expect(animMgr.stop).not.toHaveBeenCalled()

            // The next tick observes the finished (cancelled) render.
            handles[1].finish.mockReturnValueOnce(true)
            intervalCb?.()

            expect(animMgr.stop).toHaveBeenCalledTimes(1)
            // No further frame is started, and no completion is reported.
            expect(handles).toHaveLength(2)
            expect(
                pushMessage.mock.calls.filter((c) => (c[1] as { type: string }).type === 'complete'),
            ).toHaveLength(0)
        })

        it('encodes the frames with ffmpeg once they are all rendered', () => {
            const ctx = makeCtx()
            services.renderStart(ctx, makeArgs({ makeMovie: true }))
            for (let i = 0; i < FRAME_COUNT; i++) finishCurrentFrame()

            // The encode still runs as an external ProcessManager task.
            expect(queueTask).toHaveBeenCalledTimes(1)
            expect(queueTask.mock.calls[0][1]).toContain('movie_frm_%04d.png')

            intervalCb?.() // the encode task ends
            const complete = pushMessage.mock.calls
                .map((c) => c[1] as { type: string; movie?: { moviePath?: string } })
                .find((u) => u.type === 'complete')
            expect(complete?.movie?.moviePath).toContain('movie.mp4')
        })
    })
})
