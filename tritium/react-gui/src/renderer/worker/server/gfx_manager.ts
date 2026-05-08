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
const NORM_MAT_SIZE = 4 * 4 * FLOAT_SIZE;

const LIGHT_UBO_SIZE = 4 * FLOAT_SIZE + 4 * FLOAT_SIZE;

const convertType = (gl: any, itype: string): number => {
    switch (itype) {
        case "1": return gl.UNSIGNED_BYTE;
        case "21": return gl.FLOAT;
        default:
            console.error(`unknown type ${itype}`);
            throw `unknown type ${itype}`;
    }
}
    
const convGLNorm = (itype: string): boolean => {
    switch (itype) {
        case "1": return true;
        case "21": return false;
        default:
            console.error(`unknown type ${itype}`);
            throw `unknown type ${itype}`;
    }
}

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

export class GfxManager {
    // for program object
    private _prog_data: any = {};

    // common UBO info
    private _mvp_mat_loc: number = 0;
    private _mat_ubo: any = null;

    private _light_loc: number = 1;
    private _light_ubo: any = null;

    // per-shader DrawParamsBlock UBO (binding point 2)
    private _draw_params_ubo: any = {};

    // for VBOs
    private _draw_data: any = {};

    // for textures
    private _tex_data: any = {};

    private cuemol: any;
    private _sceMgr: any;
    private _canvas: any = null;
    private _afcbid_map: Map<number, number> = new Map();
    private bound_views: any = [];

    // Last known logical canvas size (CSS pixels), updated by WorkerService.resized.
    // Used to sync the size to newly activated views.
    private _logicalW: number = 0;
    private _logicalH: number = 0;

    private _context: any;

    private _enable_lighting_loc: number = 0;

    constructor(cuemol: any) {
        this.cuemol = cuemol;
        this._sceMgr = this.cuemol.getService('SceneManager');
    }

    bindCanvas(canvas: any, view_id: number, dpr: number | null = null): void {
        if (this._canvas !== null) {
            throw Error('already bound to canvas');
        }
        this._canvas = canvas;
        this._context = wrapGL(canvas.getContext('webgl2'));
        const gl = this._context;
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);

        this.createUBO();
        // this.setUpLight();

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

    removeView(view_id: number): void {
        this.stopViewLoop(view_id);
        this.bound_views = this.bound_views.filter((x: number) => x !== view_id);
    }

    startViewLoop(view_id: number): void {
        if (!this.bound_views.includes(view_id)) {
            console.warn(`startViewLoop: view ${view_id} not in bound_views, skipping`);
            return;
        }
        // Cancel existing loop for this view if any
        const existing = this._afcbid_map.get(view_id);
        if (existing !== undefined) cancelAnimationFrame(existing);
        const render = (): void => {
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
        };
        render();
    }

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

    // Create UBO
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

    toShaderTypeID(name: string): any {
        const gl = this._context;
        if (name === 'vertex') {
            return gl.VERTEX_SHADER;
        } else if (name === 'fragment') {
            return gl.FRAGMENT_SHADER;
        } else {
            throw `unknown shader type: ${name}`;
        }
    }

    /// API
    createShader(name: string, data: { [key: string]: string }): boolean {
        const gl = this._context;
        if (name in this._prog_data) {
            console.log(`CreateShader name ${name} already exists --> reuse`);
            // return false;
            return true;
        }
        const program = gl.createProgram();

        for (const [key, value] of Object.entries(data)) {
            // console.info("key: " + key + "\nsrc:" + value);
            let shader_type = this.toShaderTypeID(key);
            const shader = gl.createShader(shader_type);
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
        if (prog === undefined) {
            throw `shader ${shader_name} not found`;
        }
        gl.useProgram(prog);
        // this._enable_lighting_loc = gl.getUniformLocation(this._prog_data[shader_name],
        //                                                   "enable_lighting");
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
        const ubo = gl.createBuffer();
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
    // Projection uniforms

    // /// API
    // setUpModelMat(array_buf: any): void {
    //     // transfer UBO
    //     const gl = this._context;
    //     gl.bindBuffer(gl.UNIFORM_BUFFER, this._mat_ubo);
    //     gl.bufferSubData(gl.UNIFORM_BUFFER, 0, array_buf);
    //     gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    // }

    // /// API
    // setUpProjMat(cx: number, cy: number, array_buf: any): void {
    //     // transfer UBO
    //     const gl = this._context;
    //     gl.viewport(0, 0, cx, cy);
    //     gl.bindBuffer(gl.UNIFORM_BUFFER, this._mat_ubo);
    //     gl.bufferSubData(gl.UNIFORM_BUFFER, MODEL_MAT_SIZE + 12 * FLOAT_SIZE, array_buf);
    //     gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    // }

    // // lighting uniforms
    // setUpLight(array_buf: any): void {
    //     // console.log("light array buf: "+new Float32Array(array_buf));
    //     const gl = this._context;
    //     // let buf = new Float32Array([0.2, 0.8, 0.4, 32.0,
    //     //                             1.0, 1.0, 1.5, 0.0]);
    //     gl.bindBuffer(gl.UNIFORM_BUFFER, this._light_ubo);
    //     gl.bufferSubData(gl.UNIFORM_BUFFER, 0, array_buf);
    //     gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    // }

    //////////
    // Buffer

    /// API
    createBuffer(name: string, nsize: number, num_elems: number,
        nsize_index: number, elem_info_str: string): boolean {
        if (name in this._draw_data) {
            console.log(`name ${name} already exists`);
            return false;
        }

        const gl = this._context;
        let elem_info = JSON.parse(elem_info_str);

        // VAO
        let vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        let vertexBuffer = gl.createBuffer();
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
        gl.bufferData(gl.ARRAY_BUFFER, nsize, gl.STATIC_DRAW);

        // index buffer
        let indexBuffer = null;
        if (nsize_index > 0) {
            indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, nsize_index, gl.STATIC_DRAW);
        }

        gl.bindVertexArray(null);

        this._draw_data[name] = [vao, vertexBuffer, indexBuffer];

        console.log('create buffer OK, new_id=', name);
        return true;
    }

    /// API
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

        if (obj === undefined) {
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

        let nglmode = gl.TRIANGLES;
        if (nmode == 4) {
            nglmode = gl.LINES;
        } else if (nmode == 5) {
            nglmode = gl.TRIANGLE_STRIP;
        }
        // gl.uniform1i(this._enable_lighting_loc, enable_lighting);
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
        if (obj === null) return false;

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

    /// API
    createTexture(name: string, width: number, height: number, array_buf: any): boolean {
        if (name in this._tex_data) {
            console.log(`texture name ${name} already exists`);
            return false;
        }

        const gl = this._context;
        const tex = gl.createTexture();
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

    /// API
    bindTexture(name: string, texUnit: number): void {
        const gl = this._context;
        const tex = this._tex_data[name];
        if (tex === undefined) {
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
};
