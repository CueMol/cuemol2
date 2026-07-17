/**
 * Pins the umbreon render backend's exporter prop mapping and async drive: which
 * common props it reuses (projection/clipPlane/edgeLines/transparentBg + image
 * size), the umbreon-specific backend props, the createHandler("umbreon", 2) +
 * attach -> setPath -> beginRender start sequence (NOT the blocking write), and
 * that the returned handle forwards progress/phase/done/cancel to the exporter
 * and finish() joins (endRender) + detaches.
 */

import { describe, it, expect, vi } from 'vitest'
import { umbreonBackend } from '../worker/server/services/renderBackends/UmbreonBackend'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import type { RenderSettingsSnapshot } from '../data/renderResult'
import type { PropDef } from '../data/rendererProperties'

/** Minimal PropDef; the value readers only look at key + value. */
const p = (key: string, value: string | number | boolean): PropDef => ({
    key,
    label: key,
    type: 'real',
    value,
    group: 'g',
})

/** A mock umbreon exporter recording property sets + async method calls. */
function makeExporter(): Record<string, unknown> {
    return {
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
    }
}

const order = (f: unknown) => (f as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]

describe('umbreonBackend.beginInProcess', () => {
    it('maps common + umbreon props onto the exporter and starts the async render', () => {
        const exporter = makeExporter()
        const createHandler = vi.fn(() => exporter)
        const ctx = { strMgr: { createHandler } } as unknown as WorkerContext
        const scene = { __scene: true }

        const snapshot: RenderSettingsSnapshot = {
            backend: 'umbreon',
            commonProps: [
                p('projection', 'orthographic'),
                p('clipPlane', false),
                p('edgeLines', false),
                p('transparentBg', true),
                p('width', 800),
                p('height', 600),
                p('unit', 'px'),
                p('dpi', 600),
            ],
            backendProps: [
                p('supersample', 4),
                p('aoEnabled', true),
                p('aoSamples', 16),
                p('aoDistance', 50),
                p('aoIntensity', 0.8),
                p('shadows', true),
                p('shadowSamples', 8),
                p('lightRadius', 2),
                p('creaseLimit', 30),
                p('edgeRise', 1),
                p('useGI', true),
                p('giSamples', 64),
                p('giIntensity', 1.5),
                p('giEnvIntensity', 0.5),
                p('denoise', 'A-trous'),
            ],
        }

        const handle = umbreonBackend.beginInProcess!(ctx, scene as never, snapshot, '/out/render.png')

        expect(createHandler).toHaveBeenCalledWith('umbreon', 2)

        // Reused common props (same mapping as PovrayBackend).
        expect(exporter.perspective).toBe(false) // projection = orthographic
        expect(exporter.useClipZ).toBe(false)
        expect(exporter.showEdgeLines).toBe(false)
        expect(exporter.transparentBackground).toBe(true)
        expect(exporter.width).toBe(800)
        expect(exporter.height).toBe(600)
        expect(exporter.camera).toBe('__current')

        // Umbreon-specific backend props.
        expect(exporter.supersample).toBe(4)
        expect(exporter.aoSamples).toBe(16)
        expect(exporter.aoDistance).toBe(50)
        expect(exporter.aoIntensity).toBe(0.8)
        expect(exporter.shadows).toBe(true)
        expect(exporter.shadowSamples).toBe(8)
        expect(exporter.lightRadius).toBe(2)
        expect(exporter.creaseLimit).toBe(30)
        expect(exporter.edgeRise).toBe(1)
        // GI (pt1) props.
        expect(exporter.useGI).toBe(true)
        expect(exporter.giSamples).toBe(64)
        expect(exporter.giIntensity).toBe(1.5)
        expect(exporter.giEnvIntensity).toBe(0.5)
        // denoise "A-trous" -> pt1Denoise off + full-frame a-trous.
        expect(exporter.giDenoise).toBe(false)
        expect(exporter.denoiser).toBe(1)

        // Start sequence: attach -> setPath -> beginRender (non-blocking start).
        expect(exporter.attach).toHaveBeenCalledWith(scene)
        expect(exporter.setPath).toHaveBeenCalledWith('/out/render.png')
        expect(exporter.beginRender).toHaveBeenCalledTimes(1)
        expect(exporter.write).toBeUndefined() // the blocking write() is not used
        expect(order(exporter.attach)).toBeLessThan(order(exporter.setPath))
        expect(order(exporter.setPath)).toBeLessThan(order(exporter.beginRender))

        // The handle forwards polling to the exporter getters.
        expect(handle.progress()).toBe(0.42)
        expect(handle.phase()).toBe('Primary')
        expect(handle.isDone()).toBe(false)

        // cancel() forwards to the exporter's cooperative cancel.
        handle.cancel()
        expect(exporter.cancelRender).toHaveBeenCalledTimes(1)

        // finish(): endRender (join + write) then detach, returning the cancel flag.
        const cancelled = handle.finish()
        expect(exporter.endRender).toHaveBeenCalledTimes(1)
        expect(exporter.detach).toHaveBeenCalledTimes(1)
        expect(cancelled).toBe(false)
        expect(order(exporter.endRender)).toBeLessThan(order(exporter.detach))

        // A second finish() is a guarded no-op (does not re-run endRender/detach).
        handle.finish()
        expect(exporter.endRender).toHaveBeenCalledTimes(1)
        expect(exporter.detach).toHaveBeenCalledTimes(1)
    })

    it('reports a cancelled finish when the exporter says the render was cancelled', () => {
        const exporter = makeExporter()
        exporter.wasRenderCancelled = vi.fn(() => true)
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext
        const snapshot: RenderSettingsSnapshot = {
            backend: 'umbreon',
            commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
            backendProps: [],
        }

        const handle = umbreonBackend.beginInProcess!(ctx, {} as never, snapshot, '/o.png')
        expect(handle.finish()).toBe(true)
    })

    it('falls back to the C++ ctor defaults when umbreon props are absent', () => {
        const exporter = makeExporter()
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext
        const snapshot: RenderSettingsSnapshot = {
            backend: 'umbreon',
            commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
            backendProps: [],
        }

        umbreonBackend.beginInProcess!(ctx, {} as never, snapshot, '/o.png')

        // aoDistance keeps the unbounded 1e20 default even though the UI default
        // is a finite 100; supersample defaults to 3; projection -> perspective.
        expect(exporter.aoDistance).toBe(1e20)
        // absent aoEnabled -> AO off -> aoSamples forced to 0.
        expect(exporter.aoSamples).toBe(0)
        expect(exporter.supersample).toBe(3)
        expect(exporter.perspective).toBe(true)
        // absent denoise -> "OIDN" default -> pt1Denoise on, no full-frame pass.
        expect(exporter.giDenoise).toBe(true)
        expect(exporter.denoiser).toBe(0)
    })
})
