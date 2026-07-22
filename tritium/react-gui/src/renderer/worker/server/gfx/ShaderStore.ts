/**
 * @file worker/server/gfx/ShaderStore.ts
 * @description Shader-program and uniform-buffer resource table for GfxManager.
 *
 * Owns the compiled/linked WebGLProgram objects keyed by the names C++
 * assigns, the two shared UBOs (MVP matrices at binding point 0, lighting/fog
 * at binding point 1), and the per-shader DrawParamsBlock UBOs (binding point
 * 2). GfxManager composes one of these and forwards its peer-API shader
 * methods (createShader / deleteShader / enableShader / ...) here; the public
 * method names stay on GfxManager's prototype for the C++ peer.
 *
 * Console signposts ("shader program created OK", "UBO created", ...) are E2E
 * launch markers and are intentionally preserved.
 */

const FLOAT_SIZE = 4;
const MODEL_MAT_SIZE = 4 * 4 * FLOAT_SIZE;
const PROJ_MAT_SIZE = 4 * 4 * FLOAT_SIZE;

const LIGHT_UBO_SIZE = 4 * FLOAT_SIZE + 4 * FLOAT_SIZE;

type GL = WebGL2RenderingContext;

/**
 * Resource table for shader programs and the uniform buffers they bind.
 *
 * The GL context is supplied lazily: GfxManager constructs the store before
 * the WebGL2 context exists (it is acquired in bindCanvas), so the context is
 * injected via setContext during init.
 */
export class ShaderStore {
    // Compiled program objects keyed by C++ shader name.
    private _prog_data: { [key: string]: WebGLProgram } = {};

    // Shared MVP matrices UBO (binding point 0).
    private _mvp_mat_loc = 0;
    private _mat_ubo: WebGLBuffer | null = null;

    // Shared lighting/fog UBO (binding point 1).
    private _light_loc = 1;
    private _light_ubo: WebGLBuffer | null = null;

    // Per-shader DrawParamsBlock UBO (binding point 2).
    private _draw_params_ubo: { [key: string]: WebGLBuffer } = {};

    private _gl!: GL;

    /** Inject the WebGL2 context once it has been acquired in bindCanvas. */
    setContext(gl: GL): void {
        this._gl = gl;
    }

    /**
     * Create the two shared uniform buffer objects bound for every shader:
     * the MVP matrices block (binding point 0) and the lighting/fog block
     * (binding point 1).
     */
    createUBO(): void {
        const gl = this._gl;

        // MVP matrix UBO
        const matrix_ubo = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, matrix_ubo);
        gl.bufferData(gl.UNIFORM_BUFFER,
            MODEL_MAT_SIZE * 2 + PROJ_MAT_SIZE,
            gl.DYNAMIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, this._mvp_mat_loc, matrix_ubo);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        this._mat_ubo = matrix_ubo;

        // Lighting UBO
        const light_ubo = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, light_ubo);
        gl.bufferData(gl.UNIFORM_BUFFER,
            LIGHT_UBO_SIZE,
            gl.DYNAMIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, this._light_loc, light_ubo);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        this._light_ubo = light_ubo;

        console.log('UBO created');
    }

    /** Map a shader-type name ('vertex' | 'fragment') to its GL constant. */
    toShaderTypeID(name: string): number {
        const gl = this._gl;
        if (name === 'vertex') {
            return gl.VERTEX_SHADER;
        } else if (name === 'fragment') {
            return gl.FRAGMENT_SHADER;
        } else {
            throw `unknown shader type: ${name}`;
        }
    }

    /**
     * Compile and link a shader program from a map of
     * `{ 'vertex' | 'fragment': source }` and register it under `name`.
     * Reuses an already-registered program; returns false on compile/link
     * failure. Also wires the MatricesBlock / FogBlock / DrawParamsBlock
     * uniform blocks to their binding points.
     */
    createShader(name: string, data: { [key: string]: string }): boolean {
        const gl = this._gl;
        if (name in this._prog_data) {
            console.log(`CreateShader name ${name} already exists --> reuse`);
            // return false;
            return true;
        }
        const program = gl.createProgram()!;

        for (const [key, value] of Object.entries(data)) {
            // console.info("key: " + key + "\nsrc:" + value);
            const shader_type = this.toShaderTypeID(key);
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

        return true;
    }

    deleteShader(shader_name: string): boolean {
        const gl = this._gl;
        if (!(shader_name in this._prog_data)) {
            console.log(`name ${shader_name} not defined`);
            return false;
        }
        gl.deleteProgram(this._prog_data[shader_name]);
        return true;
    }

    enableShader(shader_name: string): void {
        const gl = this._gl;
        const prog = this._prog_data[shader_name];
        // console.info(`enableShader called: shader_name=${shader_name}, program=${prog}`);
        if (!prog) {
            throw `shader ${shader_name} not found`;
        }
        gl.useProgram(prog);
    }

    disableShader(): void {
        const gl = this._gl;
        gl.useProgram(null);
    }

    setUniformI(shader_name: string, name: string, ...values: number[]): void {
        const prog = this._prog_data[shader_name];
        const gl = this._gl;
        const loc = gl.getUniformLocation(prog, name);
        switch (values.length) {
            case 1: gl.uniform1i(loc, values[0]); break;
            case 2: gl.uniform2i(loc, values[0], values[1]); break;
            case 3: gl.uniform3i(loc, values[0], values[1], values[2]); break;
            case 4: gl.uniform4i(loc, values[0], values[1], values[2], values[3]); break;
        }
    }

    setUniformF(shader_name: string, name: string, ...values: number[]): void {
        const gl = this._gl;
        const loc = gl.getUniformLocation(this._prog_data[shader_name], name);
        switch (values.length) {
            case 1: gl.uniform1f(loc, values[0]); break;
            case 2: gl.uniform2f(loc, values[0], values[1]); break;
            case 3: gl.uniform3f(loc, values[0], values[1], values[2]); break;
            case 4: gl.uniform4f(loc, values[0], values[1], values[2], values[3]); break;
        }
    }

    setMatrix(shader_name: string, name: string, array: Float32Array): void {
        const gl = this._gl;
        const loc = gl.getUniformLocation(this._prog_data[shader_name], name);
        if (array.length === 16) {
            gl.uniformMatrix4fv(loc, false, array);
            // console.info(`setMatrix OK: shader_name=${shader_name}, name=${name}, array=${array}`);
        } else if (array.length === 9) {
            gl.uniformMatrix3fv(loc, false, array);
            // console.info(`setMatrix OK: shader_name=${shader_name}, name=${name}, array=${array}`);
        }
    }

    /** Upload the shared MVP matrices UBO (binding point 0). */
    updateMatricesUBO(data: ArrayBuffer): void {
        const gl = this._gl;
        gl.bindBuffer(gl.UNIFORM_BUFFER, this._mat_ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    }

    /** Upload the shared lighting/fog UBO (binding point 1). */
    updateFogUBO(data: ArrayBuffer): void {
        const gl = this._gl;
        gl.bindBuffer(gl.UNIFORM_BUFFER, this._light_ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    }

    /** Allocate a per-shader DrawParamsBlock UBO (binding point 2). */
    initDrawParamsUBO(shader_name: string, size: number): void {
        const gl = this._gl;
        const ubo = gl.createBuffer()!;
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
        gl.bufferData(gl.UNIFORM_BUFFER, size, gl.DYNAMIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 2, ubo);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
        this._draw_params_ubo[shader_name] = ubo;
    }

    /** Upload data to a per-shader DrawParamsBlock UBO (binding point 2). */
    updateDrawParamsUBO(shader_name: string, data: ArrayBuffer): void {
        const gl = this._gl;
        const ubo = this._draw_params_ubo[shader_name];
        if (!ubo) return;
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 2, ubo);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    }

    /** Look up a registered program by name (null if absent). */
    getProgram(name: string): WebGLProgram | undefined {
        return this._prog_data[name];
    }
}
