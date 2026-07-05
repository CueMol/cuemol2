/**
 * Pins the umbreon render backend's exporter prop mapping: which common props
 * it reuses (projection/clipPlane/edgeLines/transparentBg + image size), the
 * umbreon-specific backend props, and the createHandler("umbreon", 2) +
 * attach -> setPath -> write -> detach call sequence.
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

describe('umbreonBackend.renderInProcess', () => {
    it('maps common + umbreon props onto the exporter and writes to outputPath', () => {
        const attach = vi.fn()
        const setPath = vi.fn()
        const write = vi.fn()
        const detach = vi.fn()
        const exporter: Record<string, unknown> = { attach, setPath, write, detach }
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
                p('aoSamples', 16),
                p('aoDistance', 50),
                p('aoIntensity', 0.8),
                p('shadows', true),
                p('shadowSamples', 8),
                p('lightRadius', 2),
                p('creaseLimit', 30),
                p('edgeRise', 1),
            ],
        }

        umbreonBackend.renderInProcess!(ctx, scene as never, snapshot, '/out/render.png')

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

        // I/O sequence.
        expect(attach).toHaveBeenCalledWith(scene)
        expect(setPath).toHaveBeenCalledWith('/out/render.png')
        expect(write).toHaveBeenCalledTimes(1)
        expect(detach).toHaveBeenCalledTimes(1)
        const order = (f: ReturnType<typeof vi.fn>) => f.mock.invocationCallOrder[0]
        expect(order(attach)).toBeLessThan(order(setPath))
        expect(order(setPath)).toBeLessThan(order(write))
        expect(order(write)).toBeLessThan(order(detach))
    })

    it('falls back to the C++ ctor defaults when umbreon props are absent', () => {
        const exporter: Record<string, unknown> = {
            attach: vi.fn(),
            setPath: vi.fn(),
            write: vi.fn(),
            detach: vi.fn(),
        }
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext
        const snapshot: RenderSettingsSnapshot = {
            backend: 'umbreon',
            commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
            backendProps: [],
        }

        umbreonBackend.renderInProcess!(ctx, {} as never, snapshot, '/o.png')

        // aoDistance keeps the unbounded 1e20 default even though the UI default
        // is a finite 100; supersample defaults to 3; projection -> perspective.
        expect(exporter.aoDistance).toBe(1e20)
        expect(exporter.supersample).toBe(3)
        expect(exporter.perspective).toBe(true)
    })
})
