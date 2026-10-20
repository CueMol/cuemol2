/**
 * @file worker/server/gfx/BufferStore.ts
 * @description Vertex/index buffer (VAO+VBO) resource table for GfxManager.
 *
 * Owns the `_draw_data` table keyed by the buffer names C++ assigns: each
 * entry holds one or more (VAO, vertex VBO) slots and an optional index VBO
 * shared by the slots. GfxManager composes one of these and forwards its
 * peer-API buffer methods (createBuffer / drawBuffer / deleteBuffer) here; the
 * public method names stay on GfxManager's prototype for the C++ peer.
 *
 * A buffer whose vertex data is rewritten (isUpdated) rotates through
 * VBO_RING vertex buffers, so an update never writes the buffer the GPU may
 * still be reading for the previous frame. The extra slots are created on the
 * first update, so a static buffer keeps a single vertex buffer.
 *
 * The usage hint follows the same split: a vertex buffer starts STATIC_DRAW,
 * and the first update re-specifies it DYNAMIC_DRAW along with the new
 * slots. On ANGLE / D3D11 (Windows) rewriting a STATIC_DRAW buffer every frame
 * cost 5-7x the CPU time of the same bufferSubData into a DYNAMIC_DRAW one
 * (4V6X ribbon, 53 MB a frame: 124 vs 18 ms); never-updated buffers keep the
 * STATIC_DRAW hint so the driver may place them for drawing alone.
 *
 * Console signposts ("create buffer OK") are E2E launch markers and are
 * intentionally preserved.
 */

type GL = WebGL2RenderingContext;

/** Map a CueMol element type id to its WebGL component type constant. */
const convertType = (gl: GL, itype: string): number => {
    switch (itype) {
        case "1": return gl.UNSIGNED_BYTE;
        case "3": return gl.UNSIGNED_INT;
        case "21": return gl.FLOAT;
        // x, y, z, w packed in one word (packed normals, see
        // gfx::TrigGpuPrim::LAYOUT_PACKED)
        case "61": return gl.INT_2_10_10_10_REV;
        default:
            console.error(`unknown type ${itype}`);
            throw `unknown type ${itype}`;
    }
};

/** Whether a CueMol element type id should be normalized when uploaded. */
const convGLNorm = (itype: string): boolean => {
    switch (itype) {
        case "1": return true;
        case "3": return false;
        case "21": return false;
        case "61": return true;
        default:
            console.error(`unknown type ${itype}`);
            throw `unknown type ${itype}`;
    }
};

/**
 * Number of vertex buffers an updated buffer rotates through. Two is enough
 * for the GPU to read one while the next frame's data goes into the other.
 */
export const VBO_RING = 2;

/** One VAO and the vertex buffer it reads. */
interface VertexSlot {
    vao: WebGLVertexArrayObject;
    vbo: WebGLBuffer;
}

/** Byte range [begin, end). */
type ByteRange = [number, number];

/** The smallest range covering a and b (b may be null). */
const coverRange = (a: ByteRange, b: ByteRange | null): ByteRange =>
    b === null ? a : [Math.min(a[0], b[0]), Math.max(a[1], b[1])];

/** Bytes [offset, offset + length) of an ArrayBuffer or a view of one, without copying. */
const byteView = (buf: any, offset: number, length: number): Uint8Array =>
    ArrayBuffer.isView(buf)
        ? new Uint8Array(buf.buffer, buf.byteOffset + offset, length)
        : new Uint8Array(buf, offset, length);

/** A buffer's slots, its shared index buffer and its attribute layout. */
interface DrawEntry {
    slots: VertexSlot[];
    // Per slot, the bytes changed since that slot was last written (null:
    // none). An update may cover only part of the data, so a slot can miss
    // the parts the other slots received meanwhile.
    pending: (ByteRange | null)[];
    // Index of the slot the next draw reads.
    cur: number;
    ibo: WebGLBuffer | null;
    // Vertex buffer size in bytes, and the per-vertex stride of an
    // interleaved layout (an attribute's own stride, when given, wins).
    nsize: number;
    stride: number;
    elemInfo: any[];
}

/**
 * Resource table for vertex array / vertex buffer / index buffer sets.
 *
 * The GL context is injected via setContext once bindCanvas has acquired it.
 */
export class BufferStore {
    // Vertex slots + optional index VBO, keyed by C++ buffer name.
    private _draw_data: { [key: string]: DrawEntry } = {};

    private _gl!: GL;

    /** Inject the WebGL2 context once it has been acquired in bindCanvas. */
    setContext(gl: GL): void {
        this._gl = gl;
    }

    /**
     * Create a VAO + vertex buffer reading `entry`'s attribute layout and
     * index buffer, filled with `array_buf` or left uninitialized at the
     * entry's size, with the given usage hint.
     */
    private _createSlot(entry: DrawEntry, array_buf: any | null, usage: number): VertexSlot {
        const gl = this._gl;

        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

        entry.elemInfo.forEach((value: any) => {
            const aloc = value['nloc'];
            const atype = value['itype'];
            const gltype = convertType(gl, atype);
            const bnorm = convGLNorm(atype);
            const stride = Number(value['stride']) > 0 ? Number(value['stride']) : entry.stride;
            gl.enableVertexAttribArray(aloc);
            if (value['integer'] === '1') {
                // Integer attribute (hit names for the ID-buffer pick pass):
                // no normalization, read as uint in the shader.
                gl.vertexAttribIPointer(aloc, value['nelems'], gltype, stride, value['npos']);
            } else {
                gl.vertexAttribPointer(
                    aloc,
                    value['nelems'],
                    gltype,
                    bnorm,
                    stride,
                    value['npos']
                );
            }
            gl.vertexAttribDivisor(aloc, value['idiv']);
        });

        if (array_buf) {
            gl.bufferData(gl.ARRAY_BUFFER, array_buf, usage);
        } else {
            gl.bufferData(gl.ARRAY_BUFFER, entry.nsize, usage);
        }

        // The element buffer binding is VAO state: every slot reads the same
        // indices.
        if (entry.ibo !== null) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, entry.ibo);
        }

        gl.bindVertexArray(null);
        return { vao, vbo };
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

        // index buffer (shared by every vertex slot)
        let indexBuffer: WebGLBuffer | null = null;
        if (nsize_index > 0) {
            indexBuffer = gl.createBuffer()!;
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            if (index_buf) {
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index_buf, gl.STATIC_DRAW);
            } else {
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, nsize_index, gl.STATIC_DRAW);
            }
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }

        const entry: DrawEntry = {
            slots: [],
            pending: [],
            cur: 0,
            ibo: indexBuffer,
            nsize,
            stride: nsize / num_elems,
            elemInfo: elem_info,
        };
        entry.slots.push(this._createSlot(entry, array_buf, gl.STATIC_DRAW));
        entry.pending.push(null);

        this._draw_data[name] = entry;

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
     * `upd_offset` / `upd_length` narrow the update to those bytes
     * (length 0: the whole vertex buffer).
     */
    drawBuffer(id: number, nmode: number, nelems: number,
        array_buf: any, index_buf: any, isUpdated: boolean, ninst: number,
        upd_offset: number = 0, upd_length: number = 0): void {
        const gl = this._gl;
        const obj = this._draw_data[id];

        if (!obj) {
            throw `buffer ${id} not found`;
        }

        // The C++ side says whether the vertex data actually changed; taking
        // its word is what keeps a static scene from re-uploading every
        // buffer, every frame. Only the vertex buffer is re-sent: the indices
        // never change for the life of a buffer (a topology change allocates
        // a new draw element, hence a new buffer), so they stay as uploaded
        // by createBuffer. index_buf is still passed to pick drawElements.
        // The new data goes into the next slot of the ring, which the GPU is
        // not reading for the frame drawn last.
        // The slot also receives what changed since it was last written, and
        // every other slot records this update as missing.
        if (isUpdated) {
            const total: number = array_buf.byteLength;
            const range: ByteRange = upd_length > 0
                ? [upd_offset, upd_offset + upd_length]
                : [0, total];
            const next = (obj.cur + 1) % VBO_RING;
            if (next >= obj.slots.length) {
                // First update: the buffer is dynamic after all. Re-specify
                // the existing slots DYNAMIC_DRAW (their contents are dropped,
                // so each takes the whole data on its next write) and add the
                // new one, which holds no data yet.
                for (let i = 0; i < obj.slots.length; ++i) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, obj.slots[i].vbo);
                    gl.bufferData(gl.ARRAY_BUFFER, obj.nsize, gl.DYNAMIC_DRAW);
                    obj.pending[i] = [0, total];
                }
                obj.slots.push(this._createSlot(obj, null, gl.DYNAMIC_DRAW));
                obj.pending.push([0, total]);
            }
            const write = coverRange(range, obj.pending[next]);
            for (let i = 0; i < obj.slots.length; ++i) {
                obj.pending[i] = (i === next) ? null : coverRange(range, obj.pending[i]);
            }
            obj.cur = next;
            gl.bindBuffer(gl.ARRAY_BUFFER, obj.slots[next].vbo);
            gl.bufferSubData(gl.ARRAY_BUFFER, write[0],
                byteView(array_buf, write[0], write[1] - write[0]));
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }

        let nglmode: number = gl.TRIANGLES;
        if (nmode == 4) {
            nglmode = gl.LINES;
        } else if (nmode == 5) {
            nglmode = gl.TRIANGLE_STRIP;
        }
        gl.bindVertexArray(obj.slots[obj.cur].vao);
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
        // delete every slot's VBO and VAO
        for (const slot of obj.slots) {
            gl.deleteBuffer(slot.vbo);
            gl.deleteVertexArray(slot.vao);
        }
        // delete index VBO
        if (obj.ibo !== null) {
            gl.deleteBuffer(obj.ibo);
        }

        return true;
    }
}
