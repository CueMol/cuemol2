/**
 * Pins the umbreon render backend's drive of the C++ exporter: the settings
 * come from the scene (applyRenderSettings with the scene's stored
 * RenderSettings, or a fresh one when the scene holds none -- never a holder
 * created in the scene), the createHandler("umbreon", 2) + attach -> setPath
 * -> beginRender start sequence (NOT the blocking write), and that the
 * returned handle forwards progress/phase/done/cancel to the exporter and
 * finish() joins (endRender) + detaches. The mapping of the settings onto the
 * exporter properties is C++ (test_umbreon_apply_settings.cpp), not pinned
 * here.
 *
 * Also pins the animation variant, which drives the same async cycle one frame
 * at a time through AnimMgr.beginFrame() / endFrame() rather than the blocking
 * writeFrame().
 */

import { describe, it, expect, vi } from 'vitest'
import {
    umbreonBackend,
    umbreonNprBackend,
} from '@renderer/worker/server/services/renderjob/backends/UmbreonBackend'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { RenderSettingsSnapshot } from '@renderer/data/renderResult'

/** The snapshot is carried by the pipeline but not read by this backend. */
const snapshot: RenderSettingsSnapshot = {
    mode: 'still',
    backend: 'umbreon',
    commonProps: [],
    backendProps: [],
}

/** A mock umbreon exporter recording property sets + method calls. */
function makeExporter(): Record<string, unknown> {
    return {
        applyRenderSettings: vi.fn(() => 'umbreon'),
        attach: vi.fn(),
        setPath: vi.fn(),
        detach: vi.fn(),
        beginRender: vi.fn(),
        endRender: vi.fn(),
        cancelRender: vi.fn(),
        getRenderProgress: vi.fn(() => 0.42),
        getRenderPhaseName: vi.fn(() => 'Primary'),
        isRenderDone: vi.fn(() => false),
        wasRenderCancelled: vi.fn(() => false),
        getRenderLog: vi.fn(() => ''),
    }
}

/** A scene fake with the app-data API; `stored` is its RenderSettings, if any. */
function makeScene(stored: object | null) {
    return {
        hasAppData: vi.fn(() => stored !== null),
        getAppData: vi.fn(() => stored),
        getCreateAppData: vi.fn(() => {
            throw new Error('a render must not create the settings holder')
        }),
    }
}

/** A worker context serving `exporter` and a fresh RenderSettings object. */
function makeCtx(exporter: unknown, fresh: object = { fresh: true }) {
    const createHandler = vi.fn(() => exporter)
    const createObj = vi.fn(() => fresh)
    const ctx = { strMgr: { createHandler }, svc: { createObj } } as unknown as WorkerContext
    return { ctx, createHandler, createObj }
}

const order = (f: unknown) => (f as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]

describe('umbreonBackend.beginInProcess', () => {
    it('configures the exporter from the stored settings and starts the async render', () => {
        const exporter = makeExporter()
        const { ctx, createHandler } = makeCtx(exporter)
        const stored = { stored: true }
        const scene = makeScene(stored)

        const handle = umbreonBackend.beginInProcess!(ctx, scene as never, snapshot, '/out/render.png')

        expect(createHandler).toHaveBeenCalledWith('umbreon', 2)
        // The scene's own settings, the plain block, before the scene is attached.
        expect(exporter.applyRenderSettings).toHaveBeenCalledWith(stored, 'umbreon')
        expect(order(exporter.applyRenderSettings)).toBeLessThan(order(exporter.attach))
        expect(scene.getCreateAppData).not.toHaveBeenCalled()
        expect(exporter.camera).toBe('__current')

        // Async start sequence: attach(scene) -> setPath -> beginRender (no write()).
        expect(exporter.attach).toHaveBeenCalledWith(scene)
        expect(exporter.setPath).toHaveBeenCalledWith('/out/render.png')
        expect(exporter.beginRender).toHaveBeenCalledTimes(1)
        expect(exporter.write).toBeUndefined()
        expect(order(exporter.attach)).toBeLessThan(order(exporter.setPath))
        expect(order(exporter.setPath)).toBeLessThan(order(exporter.beginRender))

        // The handle forwards the lock-free state reads and cancellation.
        expect(handle.progress()).toBe(0.42)
        expect(handle.phase()).toBe('Primary')
        expect(handle.isDone()).toBe(false)
        expect(handle.drainLog!()).toBe('')
        handle.cancel()
        expect(exporter.cancelRender).toHaveBeenCalledTimes(1)

        // finish(): join + write (endRender), then release the scene (detach).
        expect(exporter.detach).not.toHaveBeenCalled()
        expect(handle.finish()).toBe(false)
        expect(exporter.endRender).toHaveBeenCalledTimes(1)
        expect(exporter.detach).toHaveBeenCalledTimes(1)
        expect(order(exporter.endRender)).toBeLessThan(order(exporter.detach))

        // A second finish() is a no-op (no double endRender / detach).
        handle.finish()
        expect(exporter.endRender).toHaveBeenCalledTimes(1)
        expect(exporter.detach).toHaveBeenCalledTimes(1)
    })

    it('renders a scene without settings from a fresh RenderSettings, never creating the holder', () => {
        const exporter = makeExporter()
        const fresh = { fresh: true }
        const { ctx, createObj } = makeCtx(exporter, fresh)
        const scene = makeScene(null)

        umbreonBackend.beginInProcess!(ctx, scene as never, snapshot, '/o.png')

        expect(createObj).toHaveBeenCalledWith('RenderSettings')
        expect(exporter.applyRenderSettings).toHaveBeenCalledWith(fresh, 'umbreon')
        expect(scene.getCreateAppData).not.toHaveBeenCalled()
    })

    it('fails when the addon lacks applyRenderSettings instead of rendering with defaults', () => {
        const exporter = makeExporter()
        delete exporter.applyRenderSettings
        const { ctx } = makeCtx(exporter)

        expect(() =>
            umbreonBackend.beginInProcess!(ctx, makeScene({}) as never, snapshot, '/o.png'),
        ).toThrow(/applyRenderSettings/)
        expect(exporter.beginRender).not.toHaveBeenCalled()
    })

    it('reports a cancelled finish when the exporter says the render was cancelled', () => {
        const exporter = makeExporter()
        exporter.wasRenderCancelled = vi.fn(() => true)
        const { ctx } = makeCtx(exporter)

        const handle = umbreonBackend.beginInProcess!(ctx, makeScene({}) as never, snapshot, '/o.png')
        expect(handle.finish()).toBe(true)
    })

    it('does not leak the exporter when finish() fails to join the render', () => {
        const exporter = makeExporter()
        exporter.endRender = vi.fn(() => {
            throw new Error('render produced no image')
        })
        const { ctx } = makeCtx(exporter)

        const handle = umbreonBackend.beginInProcess!(ctx, makeScene({}) as never, snapshot, '/o.png')

        // The scene stays attached until detach(), so it must run even when
        // endRender() throws (otherwise the scene is held for good).
        expect(() => handle.finish()).toThrow(/no image/)
        expect(exporter.detach).toHaveBeenCalledTimes(1)
    })

    it('detaches the scene when the render fails to start', () => {
        const exporter = makeExporter()
        exporter.beginRender = vi.fn(() => {
            throw new Error('umbreon backend not compiled in')
        })
        const { ctx } = makeCtx(exporter)

        expect(() =>
            umbreonBackend.beginInProcess!(ctx, makeScene({}) as never, snapshot, '/o.png'),
        ).toThrow(/not compiled in/)

        // attach() already ran, so the scene must be released -- otherwise the
        // exporter keeps the C++ scene reference alive until GC.
        expect(exporter.detach).toHaveBeenCalledTimes(1)
    })
})

describe('umbreonBackend.beginInProcessAnimFrame', () => {
    /** AnimMgr mock exposing the split frame-stepping pair. */
    function makeAnimMgr(hasFrame = true) {
        return {
            beginFrame: vi.fn(() => hasFrame),
            endFrame: vi.fn(),
        }
    }

    it('steps AnimMgr around the async render instead of blocking on writeFrame', () => {
        const exporter = makeExporter()
        const { ctx } = makeCtx(exporter)
        const stored = { stored: true }
        const scene = makeScene(stored)
        const animMgr = makeAnimMgr()

        const handle = umbreonBackend.beginInProcessAnimFrame!(
            ctx,
            scene as never,
            animMgr as never,
            snapshot,
            '/out/frame.png',
        )

        // The animation's scene holds the settings; configured before the frame starts.
        expect(exporter.applyRenderSettings).toHaveBeenCalledWith(stored, 'umbreon')
        expect(order(exporter.applyRenderSettings)).toBeLessThan(order(animMgr.beginFrame))

        // beginFrame() attaches the scene and hands over the animation's own
        // camera, so neither attach() nor a camera name is set here.
        expect(exporter.attach).not.toHaveBeenCalled()
        expect(exporter.camera).toBeUndefined()

        // setPath -> beginFrame -> beginRender, and the frame is NOT released
        // yet: the ray trace runs while the frame state is still applied.
        expect(exporter.setPath).toHaveBeenCalledWith('/out/frame.png')
        expect(animMgr.beginFrame).toHaveBeenCalledWith(exporter)
        expect(exporter.beginRender).toHaveBeenCalledTimes(1)
        expect(order(animMgr.beginFrame)).toBeLessThan(order(exporter.beginRender))
        expect(animMgr.endFrame).not.toHaveBeenCalled()

        // finish(): join + write the PNG, then release the frame (which is what
        // detaches the exporter and advances to the next frame).
        expect(handle.finish()).toBe(false)
        expect(exporter.endRender).toHaveBeenCalledTimes(1)
        expect(animMgr.endFrame).toHaveBeenCalledWith(exporter)
        expect(order(exporter.endRender)).toBeLessThan(order(animMgr.endFrame))
    })

    it('releases the frame when the render fails to start', () => {
        const exporter = makeExporter()
        exporter.beginRender = vi.fn(() => {
            throw new Error('umbreon backend not compiled in')
        })
        const { ctx } = makeCtx(exporter)
        const animMgr = makeAnimMgr()

        expect(() =>
            umbreonBackend.beginInProcessAnimFrame!(
                ctx,
                makeScene({}) as never,
                animMgr as never,
                snapshot,
                '/o.png',
            ),
        ).toThrow(/not compiled in/)

        // beginFrame() already attached the scene, so it must be released.
        expect(animMgr.endFrame).toHaveBeenCalledTimes(1)
    })

    it('fails when the frame sequence is already exhausted', () => {
        const exporter = makeExporter()
        const { ctx } = makeCtx(exporter)
        const animMgr = makeAnimMgr(false)

        expect(() =>
            umbreonBackend.beginInProcessAnimFrame!(
                ctx,
                makeScene({}) as never,
                animMgr as never,
                snapshot,
                '/o.png',
            ),
        ).toThrow(/no frame left/)
        expect(exporter.beginRender).not.toHaveBeenCalled()
    })
})

// The NPR backend shares the whole in-process cycle with the plain one and
// differs only in the settings block the exporter is configured from.
describe('umbreonNprBackend.beginInProcess', () => {
    it('names the NPR block on the same umbreon handler', () => {
        const exporter = makeExporter()
        const { ctx, createHandler } = makeCtx(exporter)
        const stored = { stored: true }

        umbreonNprBackend.beginInProcess!(ctx, makeScene(stored) as never, snapshot, '/o.png')

        // Same C++ exporter: NPR is a mode of it, not a separate handler.
        expect(createHandler).toHaveBeenCalledWith('umbreon', 2)
        expect(exporter.applyRenderSettings).toHaveBeenCalledWith(stored, 'umbreon_npr')
        expect(exporter.beginRender).toHaveBeenCalledTimes(1)
    })
})
