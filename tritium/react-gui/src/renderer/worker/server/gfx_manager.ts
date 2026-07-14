/**
 * @file worker/server/gfx_manager.ts
 * @description WebGL2 rendering backend for the Worker thread.
 *
 * `GfxManager` is the JS-side peer of the C++ display context: the native
 * renderer calls into it to compile shaders, upload vertex/index buffers and
 * textures, and issue draw calls against a single shared OffscreenCanvas.
 * It also owns the per-view `requestAnimationFrame` render loop.
 *
 * Methods marked `/// API` are the peer API invoked from C++ via `bindPeer`;
 * they must keep stable names and signatures. GfxManager OWNS a set of
 * collaborator objects (one per concern) and the peer methods are thin
 * forwarders to them, so the peer-API surface stays on GfxManager's prototype
 * verbatim while the resource-table / render-loop / GL-state logic lives in:
 *   - gfx/ShaderStore.ts    -- shader programs + shared/per-shader UBOs
 *   - gfx/BufferStore.ts    -- VAO/VBO/IBO sets and draw calls
 *   - gfx/TextureStore.ts   -- 2D textures (data textures, SMAA lookups)
 *   - gfx/FboStore.ts       -- off-screen render targets (GTAO/SMAA/export)
 *   - gfx/ViewLoopController -- the per-view rAF loop + idle pump + crash fwd
 *   - gfx/glState.ts        -- stateless GL global-state toggles
 */
import { BYPASS_WRAP_GL, PERF_MEASURE, perfCounters } from './perf';
import { ShaderStore } from './gfx/ShaderStore';
import { BufferStore } from './gfx/BufferStore';
import { TextureStore } from './gfx/TextureStore';
import { FboStore } from './gfx/FboStore';
import { ViewLoopController } from './gfx/ViewLoopController';
import * as glState from './gfx/glState';

/**
 * Wrap a WebGL context in a Proxy that calls `getError()` after every GL
 * call and logs any error with the offending method and arguments. A debug
 * aid; bypassed (returns the raw context) when `BYPASS_WRAP_GL` is set.
 */
function wrapGL(gl: any) {
  if (BYPASS_WRAP_GL) return gl;
  return new Proxy(gl, {
    get(target, prop) {
      const orig = target[prop];
      if (typeof orig === 'function') {
        return function (...args: unknown[]) {
          if (PERF_MEASURE) perfCounters.wrappedGlCalls++;
          const result = orig.apply(target, args);
          const err = target.getError();
          if (err !== 0) {
            console.error(`GL error 0x${err.toString(16)} in ${String(prop)}(`, ...args, ')');
          }
          return result;
        };
      }
      return orig;
    }
  });
}

/**
 * WebGL2 renderer peer bound to a single shared OffscreenCanvas.
 *
 * Holds the GL resource tables (delegated to the ShaderStore / BufferStore /
 * TextureStore / FboStore collaborators) keyed by the names the C++ side
 * assigns, and drives one `requestAnimationFrame` loop per active view (via
 * ViewLoopController). Only one view renders at a time (single canvas), so
 * `activateView` stops the other loops.
 */
export class GfxManager {
    // Resource-table collaborators (OWNED by GfxManager). The peer methods
    // below forward to these; the GL context is injected in bindCanvas.
    private readonly shaders = new ShaderStore();
    private readonly buffers = new BufferStore();
    private readonly textures = new TextureStore();
    private readonly fbos = new FboStore();
    private readonly viewLoop: ViewLoopController;

    private cuemol: any;
    private _sceMgr: any;
    private _canvas: any = null;
    private bound_views: number[] = [];

    // Last known logical canvas size (CSS pixels), updated by WorkerService.resized.
    // Used to sync the size to newly activated views.
    private _logicalW: number = 0;
    private _logicalH: number = 0;

    private _context!: WebGL2RenderingContext;

    constructor(cuemol: any) {
        this.cuemol = cuemol;
        this._sceMgr = this.cuemol.getService('SceneManager');
        this.viewLoop = new ViewLoopController(
            this.cuemol, this._sceMgr,
            (vid: number) => this.bound_views.includes(vid),
        );
    }

    /**
     * One-time WebGL2 init: acquire the context from the transferred
     * OffscreenCanvas, set up depth-test / blending, create the shared UBOs,
     * and bind the first view as a C++ render peer. Throws if already bound
     * (the canvas can only be transferred once).
     */
    bindCanvas(canvas: any, view_id: number, dpr: number | null = null): void {
        if (this._canvas !== null) {
            throw Error('already bound to canvas');
        }
        this._canvas = canvas;
        // antialias: true is the WebGL2 default, but request it explicitly so the
        // dependency is obvious. With the default aa_method (none) the scene is
        // drawn straight to the DEFAULT framebuffer, so the multisampled default
        // framebuffer IS the only geometry antialiasing -- forcing false makes
        // the view visibly jaggy. (When aa_method is a post-process pass like
        // SMAA the MSAA becomes redundant, but the context attribute is fixed at
        // creation and cannot be toggled per aa_method, so it stays on.) The
        // tradeoff is that blitDepthToDefault is skipped (a single-sample FBO
        // cannot blit into a multisampled default fb), degrading only on-screen
        // overlay depth occlusion.
        this._context = wrapGL(canvas.getContext('webgl2', { antialias: true }));
        const gl = this._context;
        // Required for rendering to RGBA16F color/normal attachments (GTAO MRT
        // normal buffer, float jitter accumulator). Acquire once; without it the
        // off-screen AO float framebuffers are incomplete.
        const floatColorExt = gl.getExtension('EXT_color_buffer_float');
        console.log('EXT_color_buffer_float =', floatColorExt !== null);
        // antialias defaults to true; a multisampled default fb cannot be a blit
        // destination from a single-sample fbo (see blitDepthToDefault).
        const defaultFbMultisampled = gl.getContextAttributes()?.antialias ?? false;
        console.log('default framebuffer multisampled =', defaultFbMultisampled);

        // Wire the GL context (and FBO capability flags) into the collaborators.
        this.shaders.setContext(gl);
        this.buffers.setContext(gl);
        this.textures.setContext(gl);
        this.fbos.setContext(gl, canvas, floatColorExt !== null, defaultFbMultisampled);

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);

        this.createUBO();

        const view = this._sceMgr.invokeMethod('getView', view_id);

        if (dpr !== null) {
            console.log('bindCanvas dpr=', dpr);
            view.invokeMethod('setSclFac', dpr, dpr);
        }

        this.cuemol.bindPeer(view, this);
        this.bound_views.push(view_id);

    }

    get canvas(): any {
        return this._canvas;
    }

    /** Bind an additional view as a render peer on the already-bound canvas. */
    addView(view_id: number, dpr: number): void {
        if (this._canvas === null) {
            throw Error('not bound to canvas');
        }
        const view = this._sceMgr.invokeMethod('getView', view_id);
        if (dpr !== null) {
            console.log('addView dpr=', dpr);
            view.invokeMethod('setSclFac', dpr, dpr);
        }
        this.cuemol.bindPeer(view, this);
        this.bound_views.push(view_id);
    }

    /** Stop a view's render loop and drop it from the bound-views list. */
    removeView(view_id: number): void {
        this.stopViewLoop(view_id);
        this.bound_views = this.bound_views.filter((x: number) => x !== view_id);
    }

    /**
     * Start the `requestAnimationFrame` render loop for a view. Each frame
     * calls `checkAndUpdateScenes`; an existing loop for the same view is
     * cancelled first. No-op if the view is not bound.
     */
    startViewLoop(view_id: number): void {
        this.viewLoop.startViewLoop(view_id);
    }

    /** Cancel a view's `requestAnimationFrame` render loop, if running. */
    stopViewLoop(view_id: number): void {
        this.viewLoop.stopViewLoop(view_id);
    }

    /**
     * Store the logical canvas size (CSS pixels) so that newly activated views
     * can be synced to the correct dimensions.  Called by WorkerService.resized.
     */
    setLogicalSize(w: number, h: number): void {
        this._logicalW = w;
        this._logicalH = h;
    }

    /**
     * Activate the given view for rendering on the single shared canvas.
     * - Stops all other view loops (single-canvas: one renderer at a time).
     * - Syncs the canvas logical size to the view via sizeChanged so that a
     *   newly added view knows the correct viewport dimensions.
     * - Forces an unconditional redraw via redraw() so that tab switches and
     *   new-scene activations immediately show the correct content even when
     *   the view's dirty flag is not set.
     * No-op if view_id is not in bound_views.
     */
    activateView(view_id: number): void {
        if (!this.bound_views.includes(view_id)) {
            console.warn(`activateView: view ${view_id} not in bound_views, skipping`);
            return;
        }
        // Sync View::m_bActive: only the activated view is active
        for (const vid of this.bound_views) {
            const v = this._sceMgr.invokeMethod('getView', vid);
            v.setProp('active', vid === view_id);
        }
        // Single-canvas: stop all other active loops
        for (const vid of this.viewLoop.activeViewIds()) {
            if (vid !== view_id) this.stopViewLoop(vid);
        }
        // Sync size and force redraw when logical size is known
        if (this._logicalW > 0 && this._logicalH > 0) {
            const view = this._sceMgr.invokeMethod('getView', view_id);
            view.invokeMethod('sizeChanged', this._logicalW, this._logicalH);
            view.invokeMethod('redraw');
        }
        this.startViewLoop(view_id);
    }

    //////////
    // UBO

    /**
     * Create the two shared uniform buffer objects bound for every shader:
     * the MVP matrices block (binding point 0) and the lighting/fog block
     * (binding point 1).
     */
    createUBO(): void {
        this.shaders.createUBO();
    }

    //////////
    // Program objects

    toShaderTypeID(name: string): number {
        return this.shaders.toShaderTypeID(name);
    }

    /**
     * Peer API. Compile and link a shader program from a map of
     * `{ 'vertex' | 'fragment': source }` and register it under `name`.
     * Reuses an already-registered program; returns false on compile/link
     * failure. Also wires the MatricesBlock / FogBlock / DrawParamsBlock
     * uniform blocks to their binding points.
     */
    /// API
    createShader(name: string, data: { [key: string]: string }): boolean {
        return this.shaders.createShader(name, data);
    }

    /// API
    deleteShader(shader_name: string): boolean {
        return this.shaders.deleteShader(shader_name);
    }

    /// API
    enableShader(shader_name: string): void {
        this.shaders.enableShader(shader_name);
    }

    /// API
    disableShader(): void {
        this.shaders.disableShader();
    }

    /// API
    setUniformI(shader_name: string, name: string, ...values: number[]): void {
        this.shaders.setUniformI(shader_name, name, ...values);
    }

    /// API
    setUniformF(shader_name: string, name: string, ...values: number[]): void {
        this.shaders.setUniformF(shader_name, name, ...values);
    }

    /// API
    setMatrix(shader_name: string, name: string, array: Float32Array): void {
        this.shaders.setMatrix(shader_name, name, array);
    }

    /// API
    setViewport(x: number, y: number, width: number, height: number): void {
        const gl = this._context;
        gl.viewport(x, y, width, height);
    }

    /// API
    updateMatricesUBO(data: ArrayBuffer): void {
        this.shaders.updateMatricesUBO(data);
    }

    /// API
    updateFogUBO(data: ArrayBuffer): void {
        this.shaders.updateFogUBO(data);
    }

    /// API: allocate per-shader DrawParamsBlock UBO (binding point 2)
    initDrawParamsUBO(shader_name: string, size: number): void {
        this.shaders.initDrawParamsUBO(shader_name, size);
    }

    /// API: upload data to per-shader DrawParamsBlock UBO (binding point 2)
    updateDrawParamsUBO(shader_name: string, data: ArrayBuffer): void {
        this.shaders.updateDrawParamsUBO(shader_name, data);
    }

    /// API
    clear(r: number, g: number, b: number): void {
        const gl = this._context;
        gl.clearColor(r, g, b, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    //////////
    // Draw state

    /// API: toggle face culling (used by edge/silhouette rendering)
    setCullFace(enabled: boolean): void {
        glState.setCullFace(this._context, enabled);
    }

    /// API: set front-face winding (true=CCW, false=CW)
    setFrontFace(bCCW: boolean): void {
        glState.setFrontFace(this._context, bCCW);
    }

    /// API: toggle inverted-color blend (ROP) used by the center mark.
    /// WebGL2 has no logic-op, so emulate via blendFuncSeparate. RGB inverts
    /// against the destination color (matches OcDisplayContext); alpha passes
    /// the source through so the framebuffer alpha stays opaque -- the canvas
    /// is created with premultipliedAlpha: true, so an alpha=0 fragment would
    /// be composited as fully transparent and the inverted RGB lost.
    setInvertColorBlend(bInv: boolean): void {
        glState.setInvertColorBlend(this._context, bInv);
    }

    /// API: toggle the depth test (GL_DEPTH_TEST). The off-screen post-process
    /// passes (AO composite / FXAA) draw a fullscreen triangle that must not be
    /// depth-rejected, so they disable it and re-enable it afterwards.
    setDepthTestEnabled(enabled: boolean): void {
        glState.setDepthTestEnabled(this._context, enabled);
    }

    /// API: toggle color blending (GL_BLEND). Data-only fullscreen passes whose
    /// alpha carries data (SMAA edges/weights) must run with blending off.
    setBlendEnabled(enabled: boolean): void {
        glState.setBlendEnabled(this._context, enabled);
    }

    /// API: select the blend function: additive (ONE, ONE) when add is true,
    /// otherwise restore the default over-blend (SRC_ALPHA, ONE_MINUS_SRC_ALPHA).
    /// Used by temporal-jitter accumulation; the caller restores the default
    /// before normal UI/overlay drawing.
    setBlendModeAdd(add: boolean): void {
        glState.setBlendModeAdd(this._context, add);
    }

    //////////
    // Buffer

    /**
     * Peer API. Create a VAO + vertex buffer (and optional index buffer)
     * under `name`, configuring vertex attributes from the JSON
     * `elem_info_str` (per-attribute location / type / size / divisor).
     * Returns false if `name` is already taken.
     */
    /// API
    createBuffer(name: string, nsize: number, num_elems: number,
                 nsize_index: number, elem_info_str: string,
                 array_buf: any | null = null,
                 index_buf: any | null = null): boolean {
        return this.buffers.createBuffer(name, nsize, num_elems, nsize_index,
                                         elem_info_str, array_buf, index_buf);
    }

    /**
     * Peer API. Issue a draw call for buffer `id`: optionally re-upload the
     * vertex/index data, then draw with the GL primitive matching `nmode`
     * (4=LINES, 5=TRIANGLE_STRIP, else TRIANGLES), instanced when `ninst>0`.
     *
     * @remarks Re-upload is gated by `isUpdated` only when `RESPECT_ISUPDATED`
     * is set; otherwise data is re-uploaded every frame.
     */
    /// API
    drawBuffer(id: number, nmode: number, nelems: number,
        array_buf: any, index_buf: any, isUpdated: boolean, ninst: number): void {
        this.buffers.drawBuffer(id, nmode, nelems, array_buf, index_buf, isUpdated, ninst);
    }

    /// API
    deleteBuffer(id: number): boolean {
        return this.buffers.deleteBuffer(id);
    }

    //////////
    // Texture

    /**
     * Peer API. Create a single-channel (R8) 2D texture under `name` from
     * `array_buf`, with clamp-to-edge wrapping and nearest filtering.
     * Returns false if `name` is already taken.
     */
    /// API
    createTexture(name: string, width: number, height: number, array_buf: any): boolean {
        return this.textures.createTexture(name, width, height, array_buf);
    }

    /**
     * API: create an immutable lookup texture (SMAA AreaTex/SearchTex).
     * ncomp 1 -> R8/RED, ncomp 2 -> RG8/RG. linear selects LINEAR vs NEAREST
     * filtering (NEAREST is mandatory for the SMAA search texture). Always
     * clamp-to-edge. Returns false if `name` is already taken.
     */
    /// API
    createDataTexture(name: string, width: number, height: number, ncomp: number,
                      linear: boolean, array_buf: any): boolean {
        return this.textures.createDataTexture(name, width, height, ncomp, linear, array_buf);
    }

    /// API
    bindTexture(name: string, texUnit: number): void {
        this.textures.bindTexture(name, texUnit);
    }

    /// API
    unbindTexture(): void {
        this.textures.unbindTexture();
    }

    /// API
    deleteTexture(name: string): boolean {
        return this.textures.deleteTexture(name);
    }

    //////////
    // Off-screen render target (framebuffer object)
    //
    // Peer API for the C++ gfx::RenderTarget abstraction (EcRenderTarget),
    // used by off-screen rendering / image export. Mirrors the OpenGL
    // OcRenderTarget implementation. `flags` bit 0x02 (RT_DEPTH_TEX) requests a
    // sampleable depth attachment. The implementation lives in gfx/FboStore.ts;
    // these peer methods forward to it.

    /// API: create an off-screen FBO. `flags` is a gfx::RTFlags bitmask:
    ///   RT_COLOR_RGBA16F (0x10) -> RGBA16F color attachment 0 (else RGBA8)
    ///   RT_COLOR_NEAREST (0x04) -> NEAREST color filtering (else LINEAR)
    ///   RT_DEPTH_TEX     (0x02) -> sampleable DEPTH_COMPONENT24 depth texture
    ///   RT_NORMAL_RGBA16F(0x08) -> RGBA16F MRT normal at color attachment 1
    /// Float (RGBA16F) attachments require EXT_color_buffer_float. Returns false
    /// if the framebuffer is incomplete.
    createFramebuffer(name: string, width: number, height: number, flags: number): boolean {
        return this.fbos.createFramebuffer(name, width, height, flags);
    }

    /// API: bind the named FBO as draw target and set the viewport to its size.
    bindFramebuffer(name: string): void {
        this.fbos.bindFramebuffer(name);
    }

    /// API: restore the default framebuffer (canvas) as draw target.
    bindDefaultFramebuffer(): void {
        this.fbos.bindDefaultFramebuffer();
    }

    /// API: clear the currently bound framebuffer's color + depth.
    clearRenderTarget(r: number, g: number, b: number, a: number): void {
        this.fbos.clearRenderTarget(r, g, b, a);
    }

    /// API: bind an FBO attachment ('color' | 'depth' | 'normal') as a sampler
    /// texture on the given texture unit.
    bindFBOTexture(name: string, which: string, texUnit: number): void {
        this.fbos.bindFBOTexture(name, which, texUnit);
    }

    /// API: blit the named FBO's depth buffer into the default framebuffer
    /// (canvas) so on-screen UI overlays z-test against the off-screen scene
    /// depth. Restores the previous draw target binding to the default fb.
    blitDepthToDefault(name: string): void {
        this.fbos.blitDepthToDefault(name);
    }

    /// API: read back an RGBA sub-rectangle of the named FBO's color
    /// attachment 0 (bottom-left origin). Returns w*h*4 bytes.
    readPixels(name: string, x: number, y: number, w: number, h: number): Uint8Array {
        return this.fbos.readPixels(name, x, y, w, h);
    }

    /// API: delete the named FBO and its attachments.
    deleteFramebuffer(name: string): boolean {
        return this.fbos.deleteFramebuffer(name);
    }
};
