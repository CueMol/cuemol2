/**
 * @file worker/server/gfx/glState.ts
 * @description Stateless WebGL2 global-state toggles used by GfxManager.
 *
 * These are pure functions over a WebGL2RenderingContext: each one issues a
 * small fixed sequence of GL state calls and holds no state of its own. The
 * peer-invoked GfxManager methods (setCullFace / setFrontFace /
 * setInvertColorBlend / setDepthTestEnabled / setBlendEnabled /
 * setBlendModeAdd) forward to these so the toggle logic lives in one place
 * while the peer-API surface stays on GfxManager's prototype.
 *
 * The exact GL call sequences are pinned by gfxManagerDrawState.test.ts.
 */

type GL = WebGL2RenderingContext;

/** Toggle face culling (GL_CULL_FACE). Used by edge/silhouette rendering. */
export function setCullFace(gl: GL, enabled: boolean): void {
    if (enabled) gl.enable(gl.CULL_FACE);
    else gl.disable(gl.CULL_FACE);
}

/** Set front-face winding (true=CCW, false=CW). */
export function setFrontFace(gl: GL, bCCW: boolean): void {
    gl.frontFace(bCCW ? gl.CCW : gl.CW);
}

/**
 * Toggle inverted-color blend (ROP) used by the center mark.
 *
 * WebGL2 has no logic-op, so emulate via blendFuncSeparate. RGB inverts
 * against the destination color (matches OcDisplayContext); alpha passes the
 * source through so the framebuffer alpha stays opaque -- the canvas is
 * created with premultipliedAlpha: true, so an alpha=0 fragment would be
 * composited as fully transparent and the inverted RGB lost.
 */
export function setInvertColorBlend(gl: GL, bInv: boolean): void {
    if (bInv) {
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(
            gl.ONE_MINUS_DST_COLOR, gl.ZERO,
            gl.ONE, gl.ZERO,
        );
    } else {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
}

/**
 * Toggle the depth test (GL_DEPTH_TEST). The off-screen post-process passes
 * (AO composite / FXAA) draw a fullscreen triangle that must not be
 * depth-rejected, so they disable it and re-enable it afterwards.
 */
export function setDepthTestEnabled(gl: GL, enabled: boolean): void {
    if (enabled) gl.enable(gl.DEPTH_TEST);
    else gl.disable(gl.DEPTH_TEST);
}

/**
 * Toggle color blending (GL_BLEND). Data-only fullscreen passes whose alpha
 * carries data (SMAA edges/weights) must run with blending off.
 */
export function setBlendEnabled(gl: GL, enabled: boolean): void {
    if (enabled) gl.enable(gl.BLEND);
    else gl.disable(gl.BLEND);
}

/**
 * Select the blend function: additive (ONE, ONE) when add is true, otherwise
 * restore the default over-blend (SRC_ALPHA, ONE_MINUS_SRC_ALPHA). Used by
 * temporal-jitter accumulation; the caller restores the default before normal
 * UI/overlay drawing.
 */
export function setBlendModeAdd(gl: GL, add: boolean): void {
    if (add) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}
