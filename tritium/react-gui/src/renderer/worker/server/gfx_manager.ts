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
 * they must keep stable names and signatures.
 */
import {
    BYPASS_WRAP_GL,
    PERF_MEASURE,
    RESPECT_ISUPDATED,
    maybeFlushPerf,
    perfCounters,
} from './perf';

const FLOAT_SIZE = 4
const MODEL_MAT_SIZE = 4 * 4 * FLOAT_SIZE;
const PROJ_MAT_SIZE = 4 * 4 * FLOAT_SIZE;

const LIGHT_UBO_SIZE = 4 * FLOAT_SIZE + 4 * FLOAT_SIZE;

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

/** Map a CueMol element type id to its WebGL component type constant. */
const convertType = (gl: any, itype: string): number => {
    switch (itype) {
        case "1": return gl.UNSIGNED_BYTE;
        case "21": return gl.FLOAT;
        default:
            console.error(`unknown type ${itype}`);
            throw `unknown type ${itype}`;
    }
}
    
/** Whether a CueMol element type id should be normalized when uploaded. */
const convGLNorm = (itype: string): boolean => {
    switch (itype) {
        case "1": return true;
        case "21": return false;
        default:
            console.error(`unknown type ${itype}`);
            throw `unknown type ${itype}`;
    }
}

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
 * Holds the GL resource tables (shader programs, VBO/VAO sets, textures,
 * UBOs) keyed by the names the C++ side assigns, and drives one
 * `requestAnimationFrame` loop per active view. Only one view renders at a
 * time (single canvas), so `activateView` stops the other loops.
 */
export class GfxManager {
    // for program object
    private _prog_data: { [key: string]: WebGLProgram } = {};

    // common UBO info
    private _mvp_mat_loc: number = 0;
    private _mat_ubo: WebGLBuffer | null = null;

    private _light_loc: number = 1;
    private _light_ubo: WebGLBuffer | null = null;

    // per-shader DrawParamsBlock UBO (binding point 2)
    private _draw_params_ubo: { [key: string]: WebGLBuffer } = {};

    // for VBOs
    private _draw_data: {
        [key: string]: [WebGLVertexArrayObject, WebGLBuffer, WebGLBuffer | null];
    } = {};

    // for textures
    private _tex_data: { [key: string]: WebGLTexture } = {};

    // for off-screen render targets (framebuffer objects), keyed by name
    private _fbo_data: {
        [key: string]: {
            fbo: WebGLFramebuffer;
            colorTex: WebGLTexture;
            depthTex: WebGLTexture | null;
            normalTex: WebGLTexture | null;
            w: number;
            h: number;
        };
    } = {};

    // EXT_color_buffer_float must be enabled to render to RGBA16F color/normal
    // attachments (the GTAO MRT normal buffer and the float jitter accumulator).
    // Null when the context does not support it; float framebuffers then fail
    // FBO completeness and the AO path degrades.
    private _floatColorExt: unknown = null;

    // True when the default framebuffer (canvas) is multisampled (the WebGL2
    // context was created with antialias: true, the browser default). A
    // single-sample off-screen FBO cannot blit into a multisampled framebuffer,
    // so blitDepthToDefault is skipped in that case -- this only degrades UI
    // overlay depth occlusion, matching the desktop OcRenderTarget behavior when
    // the depth formats are incompatible.
    private _defaultFbMultisampled: boolean = false;

    private cuemol: any;
    private _sceMgr: any;
    private _canvas: any = null;
    private _afcbid_map: Map<number, number> = new Map();
    private bound_views: number[] = [];

    // Last known logical canvas size (CSS pixels), updated by WorkerService.resized.
    // Used to sync the size to newly activated views.
    private _logicalW: number = 0;
    private _logicalH: number = 0;

    private _context!: WebGL2RenderingContext;

    constructor(cuemol: any) {
        this.cuemol = cuemol;
        this._sceMgr = this.cuemol.getService('SceneManager');
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
        this._context = wrapGL(canvas.getContext('webgl2'));
        const gl = this._context;
        // Required for rendering to RGBA16F color/normal attachments (GTAO MRT
        // normal buffer, float jitter accumulator). Acquire once; without it the
        // off-screen AO float framebuffers are incomplete.
        this._floatColorExt = gl.getExtension('EXT_color_buffer_float');
        console.log('EXT_color_buffer_float =', this._floatColorExt !== null);
        // antialias defaults to true; a multisampled default fb cannot be a blit
        // destination from a single-sample fbo (see blitDepthToDefault).
        this._defaultFbMultisampled = gl.getContextAttributes()?.antialias ?? false;
        console.log('default framebuffer multisampled =', this._defaultFbMultisampled);
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
        if (!this.bound_views.includes(view_id)) {
            console.warn(`startViewLoop: view ${view_id} not in bound_views, skipping`);
            return;
        }
        // Cancel existing loop for this view if any
        const existing = this._afcbid_map.get(view_id);
        if (existing !== undefined) cancelAnimationFrame(existing);
        const render = (): void => {
            try {
                // Pump the C++ event / timer queue before rendering so AnimMgr
                // playback (and any other setTimer-based work) advances and its
                // camera update is drawn this same frame. The Electron libuv
                // timer that would normally call performIdleTasks is not driven
                // inside the Worker, so the render loop services it here. Guarded
                // so an older native addon (without the export) degrades to a
                // no-op rather than throwing.
                if (typeof this.cuemol.performIdleTasks === 'function') {
                    this.cuemol.performIdleTasks();
                }
                if (PERF_MEASURE) {
                    const t0 = performance.now();
                    this._sceMgr.invokeMethod('checkAndUpdateScenes');
                    const elapsed = performance.now() - t0;
                    perfCounters.frameCount++;
                    perfCounters.frameTimeMs += elapsed;
                    if (elapsed > perfCounters.frameTimeMaxMs) {
                        perfCounters.frameTimeMaxMs = elapsed;
                    }
                    maybeFlushPerf();
                } else {
                    this._sceMgr.invokeMethod('checkAndUpdateScenes');
                }
                this._afcbid_map.set(view_id, requestAnimationFrame(render));
            } catch (err) {
                // A render-loop fault is fatal -- do not reschedule the rAF.
                // Forward to the renderer so the fallback UI surfaces; also
                // re-throw so the worker global error handler in
                // worker_launcher.ts can capture filename / line via the
                // ErrorEvent (some C++ throws have no usable .stack).
                const e = err as { message?: unknown; stack?: unknown };
                try {
                    self.postMessage(['__worker_crash__', {
                        message: typeof e?.message === 'string' ? e.message : String(err),
                        stack: typeof e?.stack === 'string' ? e.stack : undefined,
                        type: 'render-loop',
                    }]);
                } catch (_postErr) { /* worker may already be torn down */ }
                throw err;
            }
        };
        render();
    }

    /** Cancel a view's `requestAnimationFrame` render loop, if running. */
    stopViewLoop(view_id: number): void {
        const id = this._afcbid_map.get(view_id);
        if (id !== undefined) {
            cancelAnimationFrame(id);
            this._afcbid_map.delete(view_id);
        }
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
        for (const vid of [...this._afcbid_map.keys()]) {
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
        const gl = this._context;

        // MVP matrix UBO
        let matrix_ubo = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, matrix_ubo);
        gl.bufferData(gl.UNIFORM_BUFFER,
            MODEL_MAT_SIZE * 2 + PROJ_MAT_SIZE,
            gl.DYNAMIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, this._mvp_mat_loc, matrix_ubo);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        this._mat_ubo = matrix_ubo;

        // Lighting UBO
        let light_ubo = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, light_ubo);
        gl.bufferData(gl.UNIFORM_BUFFER,
            LIGHT_UBO_SIZE,
            gl.DYNAMIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, this._light_loc, light_ubo);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        this._light_ubo = light_ubo;

        console.log('UBO created');
    }

    //////////
    // Program objects

    toShaderTypeID(name: string): number {
        const gl = this._context;
        if (name === 'vertex') {
            return gl.VERTEX_SHADER;
        } else if (name === 'fragment') {
            return gl.FRAGMENT_SHADER;
        } else {
            throw `unknown shader type: ${name}`;
        }
    }

    /**
     * Peer API. Compile and link a shader program from a map of
     * `{ 'vertex' | 'fragment': source }` and register it under `name`.
     * Reuses an already-registered program; returns false on compile/link
     * failure. Also wires the MatricesBlock / FogBlock / DrawParamsBlock
     * uniform blocks to their binding points.
     */
    createShader(name: string, data: { [key: string]: string }): boolean {
        const gl = this._context;
        if (name in this._prog_data) {
            console.log(`CreateShader name ${name} already exists --> reuse`);
            // return false;
            return true;
        }
        const program = gl.createProgram()!;

        for (const [key, value] of Object.entries(data)) {
            // console.info("key: " + key + "\nsrc:" + value);
            let shader_type = this.toShaderTypeID(key);
            const shader = gl.createShader(shader_type)!;
            gl.shaderSource(shader, "#version 300 es\nprecision highp float;\nprecision highp int;\n" + value);
            gl.compileShader(shader);

            const status = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
            if (!status) {
                const info = gl.getShaderInfoLog(shader);
                console.log("XXX: shader compile failed");
                console.log(info);
                return false;
            }

            gl.attachShader(program, shader);
        }

        gl.linkProgram(program);

        const status = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!status) {
            const info = gl.getProgramInfoLog(program);
            console.log("XXX: shader link failed");
            console.log(info);
            return false;
        }
        console.log("shader program created OK: name=" + name);

        // Bind MatricesBlock UBO (binding point 0)
        const mat_index = gl.getUniformBlockIndex(program, 'MatricesBlock');
        if (mat_index !== gl.INVALID_INDEX) {
            gl.uniformBlockBinding(program, mat_index, this._mvp_mat_loc);
        }
        // Bind FogBlock UBO (binding point 1)
        const fog_index = gl.getUniformBlockIndex(program, 'FogBlock');
        if (fog_index !== gl.INVALID_INDEX) {
            gl.uniformBlockBinding(program, fog_index, this._light_loc);
        }
        // Bind DrawParamsBlock UBO (binding point 2)
        const dp_index = gl.getUniformBlockIndex(program, 'DrawParamsBlock');
        if (dp_index !== gl.INVALID_INDEX) {
            gl.uniformBlockBinding(program, dp_index, 2);
        }

        this._prog_data[name] = program;
        console.log("shader program register: name=" + name);
        console.log("shader program register: obj=" + this._prog_data[name]);

        return true;
    }

    /// API
    deleteShader(shader_name: string): boolean {
        const gl = this._context;
        if (!(shader_name in this._prog_data)) {
            console.log(`name ${shader_name} not defined`);
            return false;
        }
        gl.deleteProgram(this._prog_data[shader_name]);
        return true;
    }

    /// API
    enableShader(shader_name: string): void {
        const gl = this._context;
        const prog = this._prog_data[shader_name];
        // console.info(`enableShader called: shader_name=${shader_name}, program=${prog}`);
        if (!prog) {
            throw `shader ${shader_name} not found`;
        }
        gl.useProgram(prog);
    }

    /// API
    disableShader(): void {
        const gl = this._context;
        gl.useProgram(null);
    }

    /// API
    setUniformI(shader_name: string, name: string, ...values: number[]): void {
        const prog = this._prog_data[shader_name];
        const gl = this._context;
        const loc = gl.getUniformLocation(prog, name);
        switch (values.length) {
            case 1: gl.uniform1i(loc, values[0]); break;
            case 2: gl.uniform2i(loc, values[0], values[1]); break;
            case 3: gl.uniform3i(loc, values[0], values[1], values[2]); break;
            case 4: gl.uniform4i(loc, values[0], values[1], values[2], values[3]); break;
        }
    }

    /// API
    setUniformF(shader_name: string, name: string, ...values: number[]): void {
        const gl = this._context;
        const loc = gl.getUniformLocation(this._prog_data[shader_name], name);
        switch (values.length) {
            case 1: gl.uniform1f(loc, values[0]); break;
            case 2: gl.uniform2f(loc, values[0], values[1]); break;
            case 3: gl.uniform3f(loc, values[0], values[1], values[2]); break;
            case 4: gl.uniform4f(loc, values[0], values[1], values[2], values[3]); break;
        }
    }

    /// API
    setMatrix(shader_name: string, name: string, array: Float32Array): void {
        const gl = this._context;
        const loc = gl.getUniformLocation(this._prog_data[shader_name], name);
        if (array.length === 16) {
            gl.uniformMatrix4fv(loc, false, array);
            // console.info(`setMatrix OK: shader_name=${shader_name}, name=${name}, array=${array}`);
        } else if (array.length === 9) {
            gl.uniformMatrix3fv(loc, false, array);
            // console.info(`setMatrix OK: shader_name=${shader_name}, name=${name}, array=${array}`);
        }
    }

    /// API
    setViewport(x: number, y: number, width: number, height: number): void {
        const gl = this._context;
        gl.viewport(x, y, width, height);
    }

    /// API
    updateMatricesUBO(data: ArrayBuffer): void {
        const gl = this._context;
        gl.bindBuffer(gl.UNIFORM_BUFFER, this._mat_ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    }

    /// API
    updateFogUBO(data: ArrayBuffer): void {
        const gl = this._context;
        gl.bindBuffer(gl.UNIFORM_BUFFER, this._light_ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    }

    /// API: allocate per-shader DrawParamsBlock UBO (binding point 2)
    initDrawParamsUBO(shader_name: string, size: number): void {
        const gl = this._context;
        const ubo = gl.createBuffer()!;
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
        gl.bufferData(gl.UNIFORM_BUFFER, size, gl.DYNAMIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 2, ubo);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        this._draw_params_ubo[shader_name] = ubo;
    }

    /// API: upload data to per-shader DrawParamsBlock UBO (binding point 2)
    updateDrawParamsUBO(shader_name: string, data: ArrayBuffer): void {
        const gl = this._context;
        const ubo = this._draw_params_ubo[shader_name];
        if (!ubo) return;
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 2, ubo);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
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
        const gl = this._context;
        if (enabled) gl.enable(gl.CULL_FACE);
        else gl.disable(gl.CULL_FACE);
    }

    /// API: set front-face winding (true=CCW, false=CW)
    setFrontFace(bCCW: boolean): void {
        const gl = this._context;
        gl.frontFace(bCCW ? gl.CCW : gl.CW);
    }

    /// API: toggle inverted-color blend (ROP) used by the center mark.
    /// WebGL2 has no logic-op, so emulate via blendFuncSeparate. RGB inverts
    /// against the destination color (matches OcDisplayContext); alpha passes
    /// the source through so the framebuffer alpha stays opaque -- the canvas
    /// is created with premultipliedAlpha: true, so an alpha=0 fragment would
    /// be composited as fully transparent and the inverted RGB lost.
    setInvertColorBlend(bInv: boolean): void {
        const gl = this._context;
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

    /// API: toggle the depth test (GL_DEPTH_TEST). The off-screen post-process
    /// passes (AO composite / FXAA) draw a fullscreen triangle that must not be
    /// depth-rejected, so they disable it and re-enable it afterwards.
    setDepthTestEnabled(enabled: boolean): void {
        const gl = this._context;
        if (enabled) gl.enable(gl.DEPTH_TEST);
        else gl.disable(gl.DEPTH_TEST);
    }

    /// API: toggle color blending (GL_BLEND). Data-only fullscreen passes whose
    /// alpha carries data (SMAA edges/weights) must run with blending off.
    setBlendEnabled(enabled: boolean): void {
        const gl = this._context;
        if (enabled) gl.enable(gl.BLEND);
        else gl.disable(gl.BLEND);
    }

    /// API: select the blend function: additive (ONE, ONE) when add is true,
    /// otherwise restore the default over-blend (SRC_ALPHA, ONE_MINUS_SRC_ALPHA).
    /// Used by temporal-jitter accumulation; the caller restores the default
    /// before normal UI/overlay drawing.
    setBlendModeAdd(add: boolean): void {
        const gl = this._context;
        if (add) gl.blendFunc(gl.ONE, gl.ONE);
        else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    //////////
    // Buffer

    /**
     * Peer API. Create a VAO + vertex buffer (and optional index buffer)
     * under `name`, configuring vertex attributes from the JSON
     * `elem_info_str` (per-attribute location / type / size / divisor).
     * Returns false if `name` is already taken.
     */
    createBuffer(name: string, nsize: number, num_elems: number,
                 nsize_index: number, elem_info_str: string,
                 array_buf: any | null = null,
                 index_buf: any | null = null): boolean {
        if (name in this._draw_data) {
            console.log(`name ${name} already exists`);
            return false;
        }

        const gl = this._context;
        let elem_info = JSON.parse(elem_info_str);

        // VAO
        let vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        // Create buffer
        let vertexBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

        const stride = nsize / num_elems;
        elem_info.forEach((value: any) => {
            const aloc = value['nloc'];
            const atype = value['itype'];
            const gltype = convertType(gl, atype);
            const bnorm = convGLNorm(atype);
            // console.log(`elem_info: nloc=${aloc}, atype=${atype}, gltype=${gltype}`);
            gl.enableVertexAttribArray(aloc);
            gl.vertexAttribPointer(
                aloc,
                value['nelems'],
                gltype,
                bnorm,
                stride,
                value['npos']
            );
            gl.vertexAttribDivisor(aloc, value['idiv']);
        });

        // vertex buffer
        if (array_buf) {
            gl.bufferData(gl.ARRAY_BUFFER, array_buf, gl.STATIC_DRAW);
        } else {
            gl.bufferData(gl.ARRAY_BUFFER, nsize, gl.STATIC_DRAW);
        }

        // index buffer
        let indexBuffer = null;
        if (nsize_index > 0) {
            indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            if (index_buf) {
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index_buf, gl.STATIC_DRAW);
            } else {
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, nsize_index, gl.STATIC_DRAW);
            }
        }

        gl.bindVertexArray(null);

        this._draw_data[name] = [vao, vertexBuffer, indexBuffer];

        console.log('create buffer OK, new_id=', name);
        return true;
    }

    /**
     * Peer API. Issue a draw call for buffer `id`: optionally re-upload the
     * vertex/index data, then draw with the GL primitive matching `nmode`
     * (4=LINES, 5=TRIANGLE_STRIP, else TRIANGLES), instanced when `ninst>0`.
     *
     * @remarks Re-upload is gated by `isUpdated` only when `RESPECT_ISUPDATED`
     * is set; otherwise data is re-uploaded every frame.
     */
    drawBuffer(id: number, nmode: number, nelems: number,
        array_buf: any, index_buf: any, isUpdated: boolean, ninst: number): void {
        const gl = this._context;
        const obj = this._draw_data[id];

        if (PERF_MEASURE) {
            perfCounters.drawBufferCalls++;
            if (isUpdated) {
                perfCounters.drawBufferIsUpdatedRawTrue++;
                // Track which buffer names C++ marks dirty (to identify the culprit renderer)
                const name = String(id);
                perfCounters.dirtyBufferCounts[name] =
                    (perfCounters.dirtyBufferCounts[name] ?? 0) + 1;
            }
        }

        // A/B flag: when RESPECT_ISUPDATED is false, force re-upload every frame
        // (current behavior). When true, honor the C++ side's isUpdated value.
        const doUpload = RESPECT_ISUPDATED ? isUpdated : true;

        if (!obj) {
            throw `buffer ${id} not found`;
        }

        if (doUpload) {
            // Transfer VBO to GPU
            const vbo = obj[1];
            const ibo = obj[2];
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, array_buf);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            if (PERF_MEASURE) {
                perfCounters.drawBufferUploads++;
                perfCounters.bufferSubDataBytes += array_buf?.byteLength ?? 0;
            }

            if (index_buf !== null && ibo !== null) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
                gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, index_buf);
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
                if (PERF_MEASURE) {
                    perfCounters.bufferSubDataBytes += index_buf.byteLength ?? 0;
                }
            }
        }

        let nglmode: number = gl.TRIANGLES;
        if (nmode == 4) {
            nglmode = gl.LINES;
        } else if (nmode == 5) {
            nglmode = gl.TRIANGLE_STRIP;
        }
        gl.bindVertexArray(obj[0]);
        if (index_buf === null) {
            if (ninst <= 0) {
                gl.drawArrays(nglmode, 0, nelems);
            } else {
                gl.drawArraysInstanced(nglmode, 0, nelems, ninst);
            }
        } else {
            // console.log("drawelem nelems=", nelems);
            if (ninst <= 0) {
                gl.drawElements(nglmode, nelems, gl.UNSIGNED_INT, 0);
            } else {
                gl.drawElementsInstanced(nglmode, nelems, gl.UNSIGNED_INT, 0, ninst);
                // console.info(`drawElementsInstanced called: mode=${nglmode}, count=${nelems}, type=UNSIGNED_INT, offset=0, instanceCount=${ninst}`);
            }
        }
        gl.bindVertexArray(null);
    }

    /// API
    deleteBuffer(id: number): boolean {
        const gl = this._context;

        if (!(id in this._draw_data)) return false;
        const obj = this._draw_data[id];
        if (!obj) return false;

        delete this._draw_data[id];
        // delete VBO
        gl.deleteBuffer(obj[1]);
        // delete index VBO
        if (obj[2] !== null) {
            gl.deleteBuffer(obj[2]);
        }
        // delete VAO
        gl.deleteVertexArray(obj[0]);

        return true;
    }

    //////////
    // Texture

    /**
     * Peer API. Create a single-channel (R8) 2D texture under `name` from
     * `array_buf`, with clamp-to-edge wrapping and nearest filtering.
     * Returns false if `name` is already taken.
     */
    createTexture(name: string, width: number, height: number, array_buf: any): boolean {
        if (name in this._tex_data) {
            console.log(`texture name ${name} already exists`);
            return false;
        }

        const gl = this._context;
        const tex = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0,
                      gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(array_buf));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, null);

        this._tex_data[name] = tex;
        console.log('create texture OK, name=', name, 'size=', width, 'x', height);
        return true;
    }

    /**
     * API: create an immutable lookup texture (SMAA AreaTex/SearchTex).
     * ncomp 1 -> R8/RED, ncomp 2 -> RG8/RG. linear selects LINEAR vs NEAREST
     * filtering (NEAREST is mandatory for the SMAA search texture). Always
     * clamp-to-edge. Returns false if `name` is already taken.
     */
    createDataTexture(name: string, width: number, height: number, ncomp: number,
                      linear: boolean, array_buf: any): boolean {
        if (name in this._tex_data) {
            console.log(`texture name ${name} already exists`);
            return false;
        }

        const gl = this._context;
        const internalFmt = ncomp === 2 ? gl.RG8 : gl.R8;
        const fmt = ncomp === 2 ? gl.RG : gl.RED;
        const filt = linear ? gl.LINEAR : gl.NEAREST;

        const tex = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // Tight packing: SMAA search texture rows are 66 bytes (not 4-aligned).
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, width, height, 0,
                      fmt, gl.UNSIGNED_BYTE, new Uint8Array(array_buf));
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
        gl.bindTexture(gl.TEXTURE_2D, null);

        this._tex_data[name] = tex;
        console.log('create data texture OK, name=', name, 'size=', width, 'x', height,
                    'ncomp=', ncomp, 'linear=', linear);
        return true;
    }

    /// API
    bindTexture(name: string, texUnit: number): void {
        const gl = this._context;
        const tex = this._tex_data[name];
        if (!tex) {
            throw `texture ${name} not found`;
        }
        gl.activeTexture(gl.TEXTURE0 + texUnit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
    }

    /// API
    unbindTexture(): void {
        const gl = this._context;
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    /// API
    deleteTexture(name: string): boolean {
        const gl = this._context;
        if (!(name in this._tex_data)) return false;
        gl.deleteTexture(this._tex_data[name]);
        delete this._tex_data[name];
        return true;
    }

    //////////
    // Off-screen render target (framebuffer object)
    //
    // Peer API for the C++ gfx::RenderTarget abstraction (EcRenderTarget),
    // used by off-screen rendering / image export. Mirrors the OpenGL
    // OcRenderTarget implementation. `flags` bit 0x02 (RT_DEPTH_TEX) requests a
    // sampleable depth attachment.

    /// API: create an off-screen FBO. `flags` is a gfx::RTFlags bitmask:
    ///   RT_COLOR_RGBA16F (0x10) -> RGBA16F color attachment 0 (else RGBA8)
    ///   RT_COLOR_NEAREST (0x04) -> NEAREST color filtering (else LINEAR)
    ///   RT_DEPTH_TEX     (0x02) -> sampleable DEPTH_COMPONENT24 depth texture
    ///   RT_NORMAL_RGBA16F(0x08) -> RGBA16F MRT normal at color attachment 1
    /// Float (RGBA16F) attachments require EXT_color_buffer_float. Returns false
    /// if the framebuffer is incomplete.
    createFramebuffer(name: string, width: number, height: number, flags: number): boolean {
        const gl = this._context;
        if (name in this._fbo_data) {
            console.log(`createFramebuffer: ${name} already exists --> reuse`);
            return true;
        }

        const colorFloat = (flags & RT_COLOR_RGBA16F) !== 0;
        const nearest = (flags & RT_COLOR_NEAREST) !== 0;
        const wantDepth = (flags & RT_DEPTH_TEX) !== 0;
        const wantNormal = (flags & RT_NORMAL_RGBA16F) !== 0;
        const colorFilter = nearest ? gl.NEAREST : gl.LINEAR;

        if ((colorFloat || wantNormal) && this._floatColorExt === null) {
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
        let depthTex: WebGLTexture | null = null;
        if (wantDepth) {
            depthTex = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, depthTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0,
                          gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
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

    /// API: bind the named FBO as draw target and set the viewport to its size.
    bindFramebuffer(name: string): void {
        const gl = this._context;
        const info = this._fbo_data[name];
        if (!info) throw `framebuffer ${name} not found`;
        gl.bindFramebuffer(gl.FRAMEBUFFER, info.fbo);
        gl.viewport(0, 0, info.w, info.h);
    }

    /// API: restore the default framebuffer (canvas) as draw target.
    bindDefaultFramebuffer(): void {
        const gl = this._context;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    }

    /// API: clear the currently bound framebuffer's color + depth.
    clearRenderTarget(r: number, g: number, b: number, a: number): void {
        const gl = this._context;
        gl.clearColor(r, g, b, a);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    /// API: bind an FBO attachment ('color' | 'depth' | 'normal') as a sampler
    /// texture on the given texture unit.
    bindFBOTexture(name: string, which: string, texUnit: number): void {
        const gl = this._context;
        const info = this._fbo_data[name];
        if (!info) throw `framebuffer ${name} not found`;
        const tex = which === 'depth' ? info.depthTex
                  : which === 'normal' ? info.normalTex
                  : info.colorTex;
        if (!tex) return;
        gl.activeTexture(gl.TEXTURE0 + texUnit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
    }

    /// API: blit the named FBO's depth buffer into the default framebuffer
    /// (canvas) so on-screen UI overlays z-test against the off-screen scene
    /// depth. Restores the previous draw target binding to the default fb.
    blitDepthToDefault(name: string): void {
        const gl = this._context;
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

    /// API: read back an RGBA sub-rectangle of the named FBO's color
    /// attachment 0 (bottom-left origin). Returns w*h*4 bytes.
    readPixels(name: string, x: number, y: number, w: number, h: number): Uint8Array {
        const gl = this._context;
        const info = this._fbo_data[name];
        if (!info) return new Uint8Array(0);
        const buf = new Uint8Array(w * h * 4);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, info.fbo);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        return buf;
    }

    /// API: delete the named FBO and its attachments.
    deleteFramebuffer(name: string): boolean {
        const gl = this._context;
        const info = this._fbo_data[name];
        if (!info) return false;
        gl.deleteTexture(info.colorTex);
        if (info.normalTex) gl.deleteTexture(info.normalTex);
        if (info.depthTex) gl.deleteTexture(info.depthTex);
        gl.deleteFramebuffer(info.fbo);
        delete this._fbo_data[name];
        return true;
    }
};
