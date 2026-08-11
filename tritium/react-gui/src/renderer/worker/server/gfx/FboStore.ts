/**
 * @file worker/server/gfx/FboStore.ts
 * @description Off-screen render-target (FBO) resource table for GfxManager.
 *
 * Peer-side implementation of the C++ gfx::RenderTarget abstraction
 * (EcRenderTarget), used by off-screen rendering / GTAO / SMAA / image export.
 * Mirrors the OpenGL OcRenderTarget implementation. Owns the `_fbo_data` table
 * keyed by the FBO names C++ assigns; each entry holds the framebuffer plus
 * its color / depth / normal attachment textures and size.
 *
 * GfxManager composes one of these and forwards its peer-API framebuffer
 * methods (createFramebuffer / bindFramebuffer / bindDefaultFramebuffer /
 * clearRenderTarget / bindFBOTexture / blitDepthToDefault / readPixels /
 * deleteFramebuffer) here; the public method names stay on GfxManager's
 * prototype for the C++ peer.
 *
 * Console signposts ("createFramebuffer OK") are E2E launch markers and are
 * intentionally preserved.
 */

/**
 * RenderTarget flag bits, mirroring gfx::RTFlags (src/gfx/RenderTarget.hpp).
 * Passed verbatim across N-API as the `flags` argument to createFramebuffer.
 */
// RT_COLOR_RGBA8 (0x01) is the implicit default color format (no flag check
// needed -- it is the else branch of the RGBA16F test below).
const RT_DEPTH_TEX = 0x02;
const RT_COLOR_NEAREST = 0x04;
const RT_NORMAL_RGBA16F = 0x08;
const RT_COLOR_RGBA16F = 0x10;

type GL = WebGL2RenderingContext;

interface FboEntry {
    fbo: WebGLFramebuffer;
    colorTex: WebGLTexture;
    depthTex: WebGLTexture | null;
    normalTex: WebGLTexture | null;
    w: number;
    h: number;
}

/**
 * Resource table for off-screen framebuffer objects.
 *
 * Depends on bindCanvas-time state: the GL context, the canvas (default
 * framebuffer dimensions / blit target), whether EXT_color_buffer_float is
 * available (float attachments require it), and whether the default
 * framebuffer is multisampled (blitDepthToDefault is skipped then). These are
 * injected via setContext once bindCanvas has acquired them.
 */
export class FboStore {
    // Off-screen render targets keyed by C++ FBO name.
    private _fbo_data: { [key: string]: FboEntry } = {};

    private _gl!: GL;
    private _canvas: any = null;

    // True when EXT_color_buffer_float is available; required to render to
    // RGBA16F color/normal attachments (GTAO MRT normal, float jitter
    // accumulator). When false, float framebuffers fail FBO completeness and
    // the AO path degrades.
    private _floatColorAvailable = false;

    // True when the default framebuffer (canvas) is multisampled. A
    // single-sample off-screen FBO cannot blit into a multisampled
    // framebuffer, so blitDepthToDefault is skipped -- this only degrades UI
    // overlay depth occlusion (matching the desktop OcRenderTarget behavior
    // when depth formats are incompatible).
    private _defaultFbMultisampled = false;

    /**
     * Inject the WebGL2 context, canvas, and bindCanvas-time capability flags
     * once bindCanvas has acquired them.
     */
    setContext(gl: GL, canvas: any, floatColorAvailable: boolean,
               defaultFbMultisampled: boolean): void {
        this._gl = gl;
        this._canvas = canvas;
        this._floatColorAvailable = floatColorAvailable;
        this._defaultFbMultisampled = defaultFbMultisampled;
    }

    /**
     * Create an off-screen FBO. `flags` is a gfx::RTFlags bitmask:
     *   RT_COLOR_RGBA16F (0x10) -> RGBA16F color attachment 0 (else RGBA8)
     *   RT_COLOR_NEAREST (0x04) -> NEAREST color filtering (else LINEAR)
     *   RT_DEPTH_TEX     (0x02) -> sampleable DEPTH24_STENCIL8 depth texture
     *   RT_NORMAL_RGBA16F(0x08) -> RGBA16F MRT normal at color attachment 1
     * Float (RGBA16F) attachments require EXT_color_buffer_float. Returns
     * false if the framebuffer is incomplete.
     */
    createFramebuffer(name: string, width: number, height: number, flags: number): boolean {
        const gl = this._gl;
        if (name in this._fbo_data) {
            console.log(`createFramebuffer: ${name} already exists --> reuse`);
            return true;
        }

        const colorFloat = (flags & RT_COLOR_RGBA16F) !== 0;
        const nearest = (flags & RT_COLOR_NEAREST) !== 0;
        const wantDepth = (flags & RT_DEPTH_TEX) !== 0;
        const wantNormal = (flags & RT_NORMAL_RGBA16F) !== 0;
        const colorFilter = nearest ? gl.NEAREST : gl.LINEAR;

        if ((colorFloat || wantNormal) && !this._floatColorAvailable) {
            console.error(
                `createFramebuffer ${name}: float attachment requested but ` +
                `EXT_color_buffer_float is unavailable`);
            return false;
        }

        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

        // Color attachment 0 (RGBA8 or RGBA16F).
        const colorTex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, colorTex);
        if (colorFloat) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0,
                          gl.RGBA, gl.FLOAT, null);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0,
                          gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, colorFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, colorFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                                gl.TEXTURE_2D, colorTex, 0);

        // MRT normal attachment 1 (RGBA16F), for the GTAO geometry normals.
        // NEAREST: normals are packed data and must not be interpolated.
        let normalTex: WebGLTexture | null = null;
        if (wantNormal) {
            normalTex = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, normalTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0,
                          gl.RGBA, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
                                    gl.TEXTURE_2D, normalTex, 0);
        }

        // Depth attachment (sampleable), only when RT_DEPTH_TEX is set.
        //
        // DEPTH24_STENCIL8, not DEPTH_COMPONENT24: blitDepthToDefault requires
        // the read and draw depth/stencil formats to match, and the default
        // framebuffer's depth is a packed depth/stencil allocation on ANGLE/
        // Metal even when the context reports STENCIL_BITS 0. A depth-only
        // attachment made every depth blit fail with GL_INVALID_OPERATION
        // (once per frame), leaving UI overlays without scene depth. Sampling
        // is unaffected: DEPTH_STENCIL_TEXTURE_MODE defaults to
        // DEPTH_COMPONENT, so the GTAO passes read the same depth in .r.
        let depthTex: WebGLTexture | null = null;
        if (wantDepth) {
            depthTex = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, depthTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH24_STENCIL8, width, height, 0,
                          gl.DEPTH_STENCIL, gl.UNSIGNED_INT_24_8, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT,
                                    gl.TEXTURE_2D, depthTex, 0);
        }

        gl.drawBuffers(wantNormal
            ? [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]
            : [gl.COLOR_ATTACHMENT0]);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error(`createFramebuffer ${name} incomplete: 0x${status.toString(16)}`);
            gl.deleteTexture(colorTex);
            if (normalTex) gl.deleteTexture(normalTex);
            if (depthTex) gl.deleteTexture(depthTex);
            gl.deleteFramebuffer(fbo);
            return false;
        }

        this._fbo_data[name] = { fbo, colorTex, depthTex, normalTex, w: width, h: height };
        console.log(`createFramebuffer OK: ${name} ${width}x${height} ` +
                    `color=${colorFloat ? 'RGBA16F' : 'RGBA8'} ` +
                    `depth=${depthTex !== null} normal=${normalTex !== null}`);
        return true;
    }

    /** Bind the named FBO as draw target and set the viewport to its size. */
    bindFramebuffer(name: string): void {
        const gl = this._gl;
        const info = this._fbo_data[name];
        if (!info) throw `framebuffer ${name} not found`;
        gl.bindFramebuffer(gl.FRAMEBUFFER, info.fbo);
        gl.viewport(0, 0, info.w, info.h);
    }

    /** Restore the default framebuffer (canvas) as draw target. */
    bindDefaultFramebuffer(): void {
        const gl = this._gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    }

    /** Clear the currently bound framebuffer's color + depth. */
    clearRenderTarget(r: number, g: number, b: number, a: number): void {
        const gl = this._gl;
        gl.clearColor(r, g, b, a);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    /**
     * Bind an FBO attachment ('color' | 'depth' | 'normal') as a sampler
     * texture on the given texture unit.
     */
    bindFBOTexture(name: string, which: string, texUnit: number): void {
        const gl = this._gl;
        const info = this._fbo_data[name];
        if (!info) throw `framebuffer ${name} not found`;
        const tex = which === 'depth' ? info.depthTex
                  : which === 'normal' ? info.normalTex
                  : info.colorTex;
        if (!tex) return;
        gl.activeTexture(gl.TEXTURE0 + texUnit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
    }

    /**
     * Blit the named FBO's depth buffer into the default framebuffer (canvas)
     * so on-screen UI overlays z-test against the off-screen scene depth.
     * Restores the previous draw target binding to the default fb.
     */
    blitDepthToDefault(name: string): void {
        const gl = this._gl;
        const info = this._fbo_data[name];
        if (!info) return;
        // Blitting a single-sample fbo into a multisampled default framebuffer is
        // a GL_INVALID_OPERATION. Skip it (degrades only UI overlay occlusion).
        if (this._defaultFbMultisampled) return;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, info.fbo);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(
            0, 0, info.w, info.h,
            0, 0, this._canvas.width, this._canvas.height,
            gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Read back an RGBA sub-rectangle of the named FBO's color attachment 0
     * (bottom-left origin). Returns w*h*4 bytes.
     */
    readPixels(name: string, x: number, y: number, w: number, h: number): Uint8Array {
        const gl = this._gl;
        const info = this._fbo_data[name];
        if (!info) return new Uint8Array(0);
        const buf = new Uint8Array(w * h * 4);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, info.fbo);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        return buf;
    }

    /** Delete the named FBO and its attachments. */
    deleteFramebuffer(name: string): boolean {
        const gl = this._gl;
        const info = this._fbo_data[name];
        if (!info) return false;
        gl.deleteTexture(info.colorTex);
        if (info.normalTex) gl.deleteTexture(info.normalTex);
        if (info.depthTex) gl.deleteTexture(info.depthTex);
        gl.deleteFramebuffer(info.fbo);
        delete this._fbo_data[name];
        return true;
    }
}
