import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FboStore } from '@renderer/worker/server/gfx/FboStore'

/**
 * Degrade-detection tests for FboStore's depth attachment format and the
 * depth blit.
 *
 * blitDepthToDefault requires the read and draw depth/stencil formats to
 * match, and the default framebuffer's depth is a packed depth/stencil
 * allocation on ANGLE/Metal even though the context reports STENCIL_BITS 0.
 * A depth-only (DEPTH_COMPONENT24) attachment therefore made every depth
 * blit fail with GL_INVALID_OPERATION -- once per rendered frame -- and UI
 * overlays lost scene-depth occlusion. These tests pin the packed
 * DEPTH24_STENCIL8 allocation and the blit call shape so a refactor cannot
 * silently reintroduce the per-frame failure.
 */

// Real GL constant values, so a wrong constant in the implementation is
// caught by value.
const GL = {
    TEXTURE_2D: 0x0de1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    RGBA16F: 0x881a,
    UNSIGNED_BYTE: 0x1401,
    FLOAT: 0x1406,
    DEPTH_COMPONENT24: 0x81a6,
    DEPTH_COMPONENT: 0x1902,
    UNSIGNED_INT: 0x1405,
    DEPTH24_STENCIL8: 0x88f0,
    DEPTH_STENCIL: 0x84f9,
    UNSIGNED_INT_24_8: 0x84fa,
    DEPTH_ATTACHMENT: 0x8d00,
    DEPTH_STENCIL_ATTACHMENT: 0x821a,
    COLOR_ATTACHMENT0: 0x8ce0,
    COLOR_ATTACHMENT1: 0x8ce1,
    FRAMEBUFFER: 0x8d40,
    READ_FRAMEBUFFER: 0x8ca8,
    DRAW_FRAMEBUFFER: 0x8ca9,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    DEPTH_BUFFER_BIT: 0x100,
    COLOR_BUFFER_BIT: 0x4000,
    TEXTURE0: 0x84c0,
}

const RT_DEPTH_TEX = 0x02

function makeGl() {
    let texSeq = 0
    return {
        ...GL,
        createFramebuffer: vi.fn(() => ({ fb: true })),
        bindFramebuffer: vi.fn(),
        createTexture: vi.fn(() => ({ tex: ++texSeq })),
        bindTexture: vi.fn(),
        texImage2D: vi.fn(),
        texParameteri: vi.fn(),
        framebufferTexture2D: vi.fn(),
        drawBuffers: vi.fn(),
        checkFramebufferStatus: vi.fn(() => GL.FRAMEBUFFER_COMPLETE),
        blitFramebuffer: vi.fn(),
        viewport: vi.fn(),
        deleteTexture: vi.fn(),
        deleteFramebuffer: vi.fn(),
    }
}

describe('FboStore depth attachment format', () => {
    let gl: ReturnType<typeof makeGl>
    let store: FboStore

    beforeEach(() => {
        gl = makeGl()
        store = new FboStore()
        store.setContext(gl as never, { width: 800, height: 600 }, true, false)
    })

    it('allocates the depth texture as packed DEPTH24_STENCIL8', () => {
        expect(store.createFramebuffer('f', 320, 240, RT_DEPTH_TEX)).toBe(true)

        const depthAlloc = gl.texImage2D.mock.calls.find(
            (c) => c[2] === GL.DEPTH24_STENCIL8)
        expect(depthAlloc).toBeDefined()
        expect(depthAlloc).toEqual([
            GL.TEXTURE_2D, 0, GL.DEPTH24_STENCIL8, 320, 240, 0,
            GL.DEPTH_STENCIL, GL.UNSIGNED_INT_24_8, null,
        ])
        // The depth-only format is what breaks the depth blit against the
        // packed default framebuffer -- it must not come back.
        expect(gl.texImage2D.mock.calls.some(
            (c) => c[2] === GL.DEPTH_COMPONENT24)).toBe(false)
    })

    it('attaches the depth texture at DEPTH_STENCIL_ATTACHMENT', () => {
        store.createFramebuffer('f', 320, 240, RT_DEPTH_TEX)

        const attachPoints = gl.framebufferTexture2D.mock.calls.map((c) => c[1])
        expect(attachPoints).toContain(GL.DEPTH_STENCIL_ATTACHMENT)
        expect(attachPoints).not.toContain(GL.DEPTH_ATTACHMENT)
    })

    it('creates no depth texture without RT_DEPTH_TEX', () => {
        store.createFramebuffer('f', 320, 240, 0)
        expect(gl.texImage2D.mock.calls.some(
            (c) => c[2] === GL.DEPTH24_STENCIL8 || c[2] === GL.DEPTH_COMPONENT24,
        )).toBe(false)
    })
})

describe('FboStore.blitDepthToDefault', () => {
    let gl: ReturnType<typeof makeGl>

    function makeStore(defaultFbMultisampled: boolean): FboStore {
        gl = makeGl()
        const store = new FboStore()
        store.setContext(gl as never, { width: 800, height: 600 }, true,
                         defaultFbMultisampled)
        store.createFramebuffer('scene', 320, 240, RT_DEPTH_TEX)
        return store
    }

    it('blits DEPTH_BUFFER_BIT from the fbo into the default framebuffer', () => {
        const store = makeStore(false)
        store.blitDepthToDefault('scene')

        expect(gl.blitFramebuffer).toHaveBeenCalledTimes(1)
        expect(gl.blitFramebuffer).toHaveBeenCalledWith(
            0, 0, 320, 240, 0, 0, 800, 600, GL.DEPTH_BUFFER_BIT, GL.NEAREST)
        // read = the fbo, draw = null (default framebuffer)
        expect(gl.bindFramebuffer.mock.calls).toEqual(expect.arrayContaining([
            [GL.READ_FRAMEBUFFER, expect.objectContaining({ fb: true })],
            [GL.DRAW_FRAMEBUFFER, null],
        ]))
    })

    it('is skipped when the default framebuffer is multisampled', () => {
        const store = makeStore(true)
        store.blitDepthToDefault('scene')
        expect(gl.blitFramebuffer).not.toHaveBeenCalled()
    })

    it('is a no-op for an unknown fbo name', () => {
        const store = makeStore(false)
        store.blitDepthToDefault('nope')
        expect(gl.blitFramebuffer).not.toHaveBeenCalled()
    })
})
