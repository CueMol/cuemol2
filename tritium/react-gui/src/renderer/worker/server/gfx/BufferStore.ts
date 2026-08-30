/**
 * @file worker/server/gfx/BufferStore.ts
 * @description Vertex/index buffer (VAO+VBO) resource table for GfxManager.
 *
 * Owns the `_draw_data` table keyed by the buffer names C++ assigns: each
 * entry is a [VAO, vertex VBO, index VBO|null] triple. GfxManager composes one
 * of these and forwards its peer-API buffer methods (createBuffer / drawBuffer
 * / deleteBuffer) here; the public method names stay on GfxManager's prototype
 * for the C++ peer.
 *
 * Console signposts ("create buffer OK") are E2E launch markers and are
 * intentionally preserved.
 */

type GL = WebGL2RenderingContext;

/** Map a CueMol element type id to its WebGL component type constant. */
const convertType = (gl: GL, itype: string): number => {
    switch (itype) {
        case "1": return gl.UNSIGNED_BYTE;
        case "21": return gl.FLOAT;
        default:
            console.error(`unknown type ${itype}`);
            throw `unknown type ${itype}`;
    }
};

/** Whether a CueMol element type id should be normalized when uploaded. */
const convGLNorm = (itype: string): boolean => {
    switch (itype) {
        case "1": return true;
        case "21": return false;
        default:
            console.error(`unknown type ${itype}`);
            throw `unknown type ${itype}`;
    }
};

/**
 * Resource table for vertex array / vertex buffer / index buffer sets.
 *
 * The GL context is injected via setContext once bindCanvas has acquired it.
 */
export class BufferStore {
    // VAO + vertex VBO + optional index VBO, keyed by C++ buffer name.
    private _draw_data: {
        [key: string]: [WebGLVertexArrayObject, WebGLBuffer, WebGLBuffer | null];
    } = {};

    private _gl!: GL;

    /** Inject the WebGL2 context once it has been acquired in bindCanvas. */
    setContext(gl: GL): void {
        this._gl = gl;
    }

    /**
     * Create a VAO + vertex buffer (and optional index buffer) under `name`,
     * configuring vertex attributes from the JSON `elem_info_str`
     * (per-attribute location / type / size / divisor). Returns false if
     * `name` is already taken.
     */
    createBuffer(name: string, nsize: number, num_elems: number,
                 nsize_index: number, elem_info_str: string,
                 array_buf: any | null = null,
                 index_buf: any | null = null): boolean {
        if (name in this._draw_data) {
            console.log(`name ${name} already exists`);
            return false;
        }

        const gl = this._gl;
        const elem_info = JSON.parse(elem_info_str);

        // VAO
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        // Create buffer
        const vertexBuffer = gl.createBuffer()!;
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
     * Issue a draw call for buffer `id`: optionally re-upload the vertex/index
     * data, then draw with the GL primitive matching `nmode` (4=LINES,
     * 5=TRIANGLE_STRIP, else TRIANGLES), instanced when `ninst>0`.
     *
     * @remarks Re-upload is gated by the C++ side's `isUpdated`
     * is set; otherwise data is re-uploaded every frame.
     */
    drawBuffer(id: number, nmode: number, nelems: number,
        array_buf: any, index_buf: any, isUpdated: boolean, ninst: number): void {
        const gl = this._gl;
        const obj = this._draw_data[id];

        if (!obj) {
            throw `buffer ${id} not found`;
        }

        // The C++ side says whether the vertex data actually changed; taking
        // its word is what keeps a static scene from re-uploading every
        // buffer, every frame.
        if (isUpdated) {
            // Transfer VBO to GPU
            const vbo = obj[1];
            const ibo = obj[2];
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, array_buf);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            if (index_buf !== null && ibo !== null) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
                gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, index_buf);
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
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

    deleteBuffer(id: number): boolean {
        const gl = this._gl;

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
}
