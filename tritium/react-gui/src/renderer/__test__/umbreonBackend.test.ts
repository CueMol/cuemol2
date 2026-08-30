/**
 * Pins the umbreon render backend's exporter prop mapping and async drive: which
 * common props it reuses (projection/clipPlane/edgeLines/transparentBg + image
 * size), the umbreon-specific backend props, the createHandler("umbreon", 2) +
 * attach -> setPath -> beginRender start sequence (NOT the blocking write), and
 * that the returned handle forwards progress/phase/done/cancel to the exporter
 * and finish() joins (endRender) + detaches.
 *
 * Also pins the animation variant, which drives the same async cycle one frame
 * at a time through AnimMgr.beginFrame() / endFrame() rather than the blocking
 * writeFrame().
 */

import { describe, it, expect, vi } from 'vitest'
import {
    umbreonBackend,
    umbreonNprBackend,
} from '@renderer/worker/server/services/renderBackends/UmbreonBackend'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { RenderSettingsSnapshot } from '@renderer/data/renderResult'
import type { PropDef } from '@renderer/data/rendererProperties'

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
        getRenderLog: vi.fn(() => ''),
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
            mode: 'still',
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
                p('contactEdges', true),
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
        expect(exporter.contactEdges).toBe(true)
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

        // umbreon's own diagnostics reach the render log through the handle:
        // an in-process backend has no stdout for the host to capture, so a
        // fallback warning or the GI stage timing would otherwise be lost.
        ;(exporter.getRenderLog as ReturnType<typeof vi.fn>).mockReturnValueOnce(
            'warning: --ao-res out is not supported with --gi yet\n',
        )
        expect(handle.drainLog?.()).toBe(
            'warning: --ao-res out is not supported with --gi yet\n',
        )

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
            mode: 'still',
            backend: 'umbreon',
            commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
            backendProps: [],
        }

        const handle = umbreonBackend.beginInProcess!(ctx, {} as never, snapshot, '/o.png')
        expect(handle.finish()).toBe(true)
    })

    it('does not leak the exporter when finish() fails to join the render', () => {
        const exporter = makeExporter()
        exporter.endRender = vi.fn(() => {
            throw new Error('render produced no image')
        })
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext
        const snapshot: RenderSettingsSnapshot = {
            mode: 'still',
            backend: 'umbreon',
            commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
            backendProps: [],
        }

        const handle = umbreonBackend.beginInProcess!(ctx, {} as never, snapshot, '/o.png')

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
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext
        const snapshot: RenderSettingsSnapshot = {
            mode: 'still',
            backend: 'umbreon',
            commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
            backendProps: [],
        }

        expect(() =>
            umbreonBackend.beginInProcess!(ctx, {} as never, snapshot, '/o.png'),
        ).toThrow(/not compiled in/)

        // attach() already ran, so the scene must be released -- otherwise the
        // exporter keeps the C++ scene reference alive until GC.
        expect(exporter.detach).toHaveBeenCalledTimes(1)
    })

    it('falls back to the C++ ctor defaults when umbreon props are absent', () => {
        const exporter = makeExporter()
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext
        const snapshot: RenderSettingsSnapshot = {
            mode: 'still',
            backend: 'umbreon',
            commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
            backendProps: [],
        }

        umbreonBackend.beginInProcess!(ctx, {} as never, snapshot, '/o.png')

        // supersample defaults to 3; projection -> perspective.
        // absent aoEnabled -> AO off -> aoSamples forced to 0, and the rest of
        // the AO block stays unwritten so umbreon keeps its neutral defaults
        // (see the AO-off test below).
        expect(exporter.aoSamples).toBe(0)
        expect(exporter.aoDistance).toBeUndefined()
        expect(exporter.aoResDiv).toBeUndefined()
        expect(exporter.supersample).toBe(3)
        // Antialiasing is plain grid supersampling: the adaptive-AA knobs are
        // never written, so umbreon keeps its (off) defaults.
        expect(exporter.aaMode).toBeUndefined()
        expect(exporter.aaDepth).toBeUndefined()
        expect(exporter.perspective).toBe(true)
        // absent denoise -> "OIDN" default -> pt1Denoise on, no full-frame pass.
        expect(exporter.giDenoise).toBe(true)
        expect(exporter.denoiser).toBe(0)
        // Cross-renderer contact contours stay off, so an unset prop renders
        // the same picture umbreon and the GL view draw.
        expect(exporter.contactEdges).toBe(false)
    })

    // AO and GI are alternatives (the Lighting selector enforces it), so an AO
    // recipe has no business travelling with a GI render. umbreon reads
    // aoResDiv BEFORE the aoSamples > 0 gate and cannot combine its coarse-AO
    // grid with GI, so sending "gather per output pixel" alongside GI made it
    // warn ("--ao-res out is not supported with --gi yet") on every render.
    it('writes no AO settings at all while AO is off', () => {
        const exporter = makeExporter()
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext

        const snapshot: RenderSettingsSnapshot = {
            mode: 'still',
            backend: 'umbreon',
            commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
            backendProps: [
                p('aoEnabled', false),
                // Values left behind by an earlier AO session must not leak out.
                p('aoSamples', 256),
                p('aoGather', 'Per output pixel'),
                p('aoMultiScale', true),
                p('aoBentNormal', true),
                p('aoLowDiscrepancy', true),
                p('aoDiffuseFactor', 1),
                p('aoDistance', 50),
                p('aoIntensity', 0.8),
                p('useGI', true),
            ],
        }

        umbreonBackend.beginInProcess!(ctx, {} as never, snapshot, '/o.png')

        expect(exporter.aoSamples).toBe(0)
        expect(exporter.aoResDiv).toBeUndefined()
        expect(exporter.aoMultiScale).toBeUndefined()
        expect(exporter.aoBentNormal).toBeUndefined()
        expect(exporter.aoLowDiscrepancy).toBeUndefined()
        expect(exporter.aoDiffuseFactor).toBeUndefined()
        expect(exporter.aoDistance).toBeUndefined()
        expect(exporter.aoIntensity).toBeUndefined()
        // GI itself is unaffected.
        expect(exporter.useGI).toBe(true)
    })

    it('writes the AO recipe while AO is on', () => {
        const exporter = makeExporter()
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext

        const snapshot: RenderSettingsSnapshot = {
            mode: 'still',
            backend: 'umbreon',
            commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
            backendProps: [
                p('aoEnabled', true),
                p('aoSamples', 64),
                p('aoGather', 'Per shading hit'),
                p('aoMultiScale', true),
                p('aoDiffuseFactor', 1),
            ],
        }

        umbreonBackend.beginInProcess!(ctx, {} as never, snapshot, '/o.png')

        expect(exporter.aoSamples).toBe(64)
        expect(exporter.aoResDiv).toBe(0) // "Per shading hit"
        expect(exporter.aoMultiScale).toBe(true)
        expect(exporter.aoDiffuseFactor).toBe(1)
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

    const snapshot: RenderSettingsSnapshot = {
        mode: 'movie',
        backend: 'umbreon',
        commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
        backendProps: [p('supersample', 2)],
    }

    it('steps AnimMgr around the async render instead of blocking on writeFrame', () => {
        const exporter = makeExporter()
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext
        const animMgr = makeAnimMgr()

        const handle = umbreonBackend.beginInProcessAnimFrame!(
            ctx,
            animMgr as never,
            snapshot,
            '/out/frame.png',
        )

        // The snapshot still drives the exporter props.
        expect(exporter.supersample).toBe(2)
        expect(exporter.width).toBe(640)

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
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext
        const animMgr = makeAnimMgr()

        expect(() =>
            umbreonBackend.beginInProcessAnimFrame!(ctx, animMgr as never, snapshot, '/o.png'),
        ).toThrow(/not compiled in/)

        // beginFrame() already attached the scene, so it must be released.
        expect(animMgr.endFrame).toHaveBeenCalledTimes(1)
    })

    it('fails when the frame sequence is already exhausted', () => {
        const exporter = makeExporter()
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext
        const animMgr = makeAnimMgr(false)

        expect(() =>
            umbreonBackend.beginInProcessAnimFrame!(ctx, animMgr as never, snapshot, '/o.png'),
        ).toThrow(/no frame left/)
        expect(exporter.beginRender).not.toHaveBeenCalled()
    })
})

// The NPR backend shares the whole in-process cycle with the plain one and
// differs only in the exporter block it writes: the hatch pass instead of GI.
describe('umbreonNprBackend.beginInProcess', () => {
    const nprSnapshot = (extra: PropDef[] = []): RenderSettingsSnapshot => ({
        mode: 'still',
        backend: 'umbreon_npr',
        commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
        backendProps: [
            p('supersample', 4),
            p('hatchStyle', 'manga'),
            p('hatchDensity', 2),
            p('hatchWidthScale', 0.5),
            p('hatchColoring', 'Ink on color fill'),
            p('hatchDefaultEdges', false),
            ...extra,
        ],
    })

    const beginNpr = (snapshot: RenderSettingsSnapshot) => {
        const exporter = makeExporter()
        const createHandler = vi.fn(() => exporter)
        const ctx = { strMgr: { createHandler } } as unknown as WorkerContext
        umbreonNprBackend.beginInProcess!(ctx, {} as never, snapshot, '/o.png')
        return { exporter, createHandler }
    }

    it('writes the hatch block and no GI, reusing the umbreon exporter', () => {
        const { exporter, createHandler } = beginNpr(nprSnapshot())

        // Same C++ exporter: NPR is a mode of it, not a separate handler.
        expect(createHandler).toHaveBeenCalledWith('umbreon', 2)
        expect(exporter.supersample).toBe(4)

        expect(exporter.hatchEnable).toBe(true)
        expect(exporter.hatchStyle).toBe('manga')
        expect(exporter.hatchDensity).toBe(2)
        expect(exporter.hatchWidthScale).toBe(0.5)
        expect(exporter.hatchDefaultEdges).toBe(false)
        // "Ink on color fill" = a flat unshaded fill of each renderer's own
        // color under a fixed ink (the manual's comic pattern).
        expect(exporter.hatchBase).toBe('albedo')
        expect(exporter.hatchInk).toBe('fixed')

        // GI is never sent: hatch ink mode discards the shaded color, so
        // umbreon force-disables it and a sent value would only mislead.
        expect(exporter.useGI).toBeUndefined()
        expect(exporter.giSamples).toBeUndefined()
        expect(exporter.denoiser).toBeUndefined()
    })

    it('sends a color only while its Custom switch is on', () => {
        // Off: empty strings tell the exporter to keep the style's own colors
        // (richardson's warm paper and per-section ink would be destroyed by
        // an unconditional black-on-white default).
        const off = beginNpr(
            nprSnapshot([p('hatchInkColor', '#123456'), p('hatchPaperColor', '#abcdef')]),
        )
        expect(off.exporter.hatchInkColor).toBe('')
        expect(off.exporter.hatchPaperColor).toBe('')

        const on = beginNpr(
            nprSnapshot([
                p('hatchCustomInk', true),
                p('hatchInkColor', '#123456'),
                p('hatchCustomPaper', true),
                p('hatchPaperColor', '#abcdef'),
            ]),
        )
        expect(on.exporter.hatchInkColor).toBe('#123456')
        expect(on.exporter.hatchPaperColor).toBe('#abcdef')
    })

    it('keeps the style\'s own base/ink model on "Style default"', () => {
        const snapshot = nprSnapshot()
        snapshot.backendProps = snapshot.backendProps.map((prop) =>
            prop.key === 'hatchColoring' ? p('hatchColoring', 'Style default') : prop,
        )
        const { exporter } = beginNpr(snapshot)
        expect(exporter.hatchBase).toBe('')
        expect(exporter.hatchInk).toBe('')
    })

    it('the plain umbreon backend never enables hatching', () => {
        const exporter = makeExporter()
        const ctx = {
            strMgr: { createHandler: vi.fn(() => exporter) },
        } as unknown as WorkerContext
        const snapshot: RenderSettingsSnapshot = {
            mode: 'still',
            backend: 'umbreon',
            commonProps: [p('width', 640), p('height', 480), p('unit', 'px'), p('dpi', 600)],
            backendProps: [p('useGI', true)],
        }
        umbreonBackend.beginInProcess!(ctx, {} as never, snapshot, '/o.png')
        expect(exporter.hatchEnable).toBeUndefined()
        expect(exporter.useGI).toBe(true)
    })
})

// The edited hatch look (layer editor) rides the snapshot as spec text and is
// forwarded verbatim; without it the exporter keeps the style's own layers.
describe('umbreonNprBackend hatch spec forwarding', () => {
    const base = (): RenderSettingsSnapshot => ({
        mode: 'still',
        backend: 'umbreon_npr',
        commonProps: [p('width', 64), p('height', 64), p('unit', 'px'), p('dpi', 600)],
        backendProps: [p('hatchStyle', 'richardson')],
    })
    const begin = (backend: typeof umbreonBackend, snapshot: RenderSettingsSnapshot) => {
        const exporter = makeExporter()
        const ctx = { strMgr: { createHandler: vi.fn(() => exporter) } } as unknown as WorkerContext
        backend.beginInProcess!(ctx, {} as never, snapshot, '/o.png')
        return exporter
    }

    it('forwards the layers and tone spec text verbatim', () => {
        const exporter = begin(umbreonNprBackend, {
            ...base(),
            hatch: { layersSpec: 'layer: kind=line,width=2\n', toneSpec: 'tone: strength=2\nink: tonefog=off\n' },
        })
        expect(exporter.hatchLayersSpec).toBe('layer: kind=line,width=2\n')
        expect(exporter.hatchToneSpec).toBe('tone: strength=2\nink: tonefog=off\n')
    })

    it('sends nothing for an unedited look, and never on the plain umbreon backend', () => {
        expect(begin(umbreonNprBackend, base()).hatchLayersSpec).toBeUndefined()
        const plain = begin(umbreonBackend, {
            ...base(),
            backend: 'umbreon',
            hatch: { layersSpec: 'layer: kind=line\n', toneSpec: '' },
        })
        expect(plain.hatchLayersSpec).toBeUndefined()
        expect(plain.hatchEnable).toBeUndefined()
    })
})
