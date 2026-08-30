import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GfxManager } from '@renderer/worker/server/gfx_manager'

/**
 * Degrade-detection test for GfxManager draw-state methods.
 *
 * These methods back ElecDisplayContext::setCullFace / setFrontFace /
 * setInvertColorBlend / setDepthTestEnabled / setBlendEnabled /
 * setBlendModeAdd.  Edge (silhouette) rendering relies on face culling, the
 * center mark relies on the inverted-color blend, and the post-process passes
 * (AO composite / FXAA / SMAA / temporal-jitter accumulation) toggle the depth
 * test and blend state; if these regress to no-ops the WebGL state never
 * changes and rendering breaks.  This test pins the exact GL calls each method
 * emits.
 */

// Distinct sentinel values so a wrong constant is caught.
const GL = {
    CULL_FACE: 0xb44,
    BLEND: 0xbe2,
    DEPTH_TEST: 0xb71,
    CCW: 0x901,
    CW: 0x900,
    ZERO: 0,
    ONE: 1,
    SRC_ALPHA: 0x302,
    ONE_MINUS_SRC_ALPHA: 0x303,
    ONE_MINUS_DST_COLOR: 0x307,
}

function makeGl() {
    return {
        ...GL,
        enable: vi.fn(),
        disable: vi.fn(),
        frontFace: vi.fn(),
        blendFunc: vi.fn(),
        blendFuncSeparate: vi.fn(),
    }
}

function makeGfx(gl: ReturnType<typeof makeGl>): GfxManager {
    const cuemol = { getService: vi.fn(() => ({})) }
    const gfx = new GfxManager(cuemol)
    ;(gfx as unknown as { _context: unknown })._context = gl
    return gfx
}

describe('GfxManager draw-state methods', () => {
    let gl: ReturnType<typeof makeGl>
    let gfx: GfxManager

    beforeEach(() => {
        gl = makeGl()
        gfx = makeGfx(gl)
    })

    it('setCullFace(true) enables CULL_FACE', () => {
        gfx.setCullFace(true)
        expect(gl.enable).toHaveBeenCalledWith(GL.CULL_FACE)
        expect(gl.disable).not.toHaveBeenCalled()
    })

    it('setCullFace(false) disables CULL_FACE', () => {
        gfx.setCullFace(false)
        expect(gl.disable).toHaveBeenCalledWith(GL.CULL_FACE)
        expect(gl.enable).not.toHaveBeenCalled()
    })

    it('setFrontFace toggles between CCW and CW', () => {
        gfx.setFrontFace(true)
        expect(gl.frontFace).toHaveBeenCalledWith(GL.CCW)
        gfx.setFrontFace(false)
        expect(gl.frontFace).toHaveBeenCalledWith(GL.CW)
    })

    // Alpha must pass src.a (= ONE/ZERO) so the framebuffer alpha stays
    // opaque -- the canvas is created with premultipliedAlpha: true, so an
    // alpha=0 fragment would be composited as fully transparent and the
    // inverted RGB lost.  blendFunc(ONE_MINUS_DST_COLOR, ZERO) would zero
    // the alpha and is the regression this test guards against.
    it('setInvertColorBlend(true) selects the inverted-color blend func with pass-through alpha', () => {
        gfx.setInvertColorBlend(true)
        expect(gl.enable).toHaveBeenCalledWith(GL.BLEND)
        expect(gl.blendFuncSeparate).toHaveBeenCalledWith(
            GL.ONE_MINUS_DST_COLOR, GL.ZERO,
            GL.ONE, GL.ZERO,
        )
        expect(gl.blendFunc).not.toHaveBeenCalled()
    })

    it('setInvertColorBlend(false) restores standard alpha blending', () => {
        gfx.setInvertColorBlend(false)
        expect(gl.blendFunc).toHaveBeenCalledWith(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA)
    })

    it('setDepthTestEnabled toggles DEPTH_TEST', () => {
        gfx.setDepthTestEnabled(true)
        expect(gl.enable).toHaveBeenCalledWith(GL.DEPTH_TEST)
        expect(gl.disable).not.toHaveBeenCalled()

        gl.enable.mockClear()
        gfx.setDepthTestEnabled(false)
        expect(gl.disable).toHaveBeenCalledWith(GL.DEPTH_TEST)
        expect(gl.enable).not.toHaveBeenCalled()
    })

    it('setBlendEnabled toggles BLEND', () => {
        gfx.setBlendEnabled(true)
        expect(gl.enable).toHaveBeenCalledWith(GL.BLEND)
        expect(gl.disable).not.toHaveBeenCalled()

        gl.enable.mockClear()
        gfx.setBlendEnabled(false)
        expect(gl.disable).toHaveBeenCalledWith(GL.BLEND)
        expect(gl.enable).not.toHaveBeenCalled()
    })

    // Additive accumulation (temporal jitter) must use blendFunc(ONE, ONE);
    // restoring uses the standard over-blend. A regression that swaps these
    // breaks temporal AA accumulation.
    it('setBlendModeAdd(true) selects additive blending', () => {
        gfx.setBlendModeAdd(true)
        expect(gl.blendFunc).toHaveBeenCalledWith(GL.ONE, GL.ONE)
    })

    it('setBlendModeAdd(false) restores standard alpha blending', () => {
        gfx.setBlendModeAdd(false)
        expect(gl.blendFunc).toHaveBeenCalledWith(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA)
    })
})
