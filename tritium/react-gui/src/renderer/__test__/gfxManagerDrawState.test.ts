import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GfxManager } from '../worker/server/gfx_manager'

/**
 * Degrade-detection test for GfxManager draw-state methods.
 *
 * These methods back ElecDisplayContext::setCullFace / setFrontFace /
 * setInvertColorBlend.  Edge (silhouette) rendering relies on face culling and
 * the center mark relies on the inverted-color blend; if these regress to
 * no-ops the WebGL state never changes and rendering breaks (black model /
 * invisible center mark).  This test pins the exact GL calls each method emits.
 */

// Distinct sentinel values so a wrong constant is caught.
const GL = {
    CULL_FACE: 0xb44,
    BLEND: 0xbe2,
    CCW: 0x901,
    CW: 0x900,
    ZERO: 0,
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

    it('setInvertColorBlend(true) selects the inverted-color blend func', () => {
        gfx.setInvertColorBlend(true)
        expect(gl.enable).toHaveBeenCalledWith(GL.BLEND)
        expect(gl.blendFunc).toHaveBeenCalledWith(GL.ONE_MINUS_DST_COLOR, GL.ZERO)
    })

    it('setInvertColorBlend(false) restores standard alpha blending', () => {
        gfx.setInvertColorBlend(false)
        expect(gl.blendFunc).toHaveBeenCalledWith(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA)
    })
})
