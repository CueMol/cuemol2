/**
 * @file worker/server/gfx/TextureStore.ts
 * @description 2D texture resource table for GfxManager.
 *
 * Owns the `_tex_data` table keyed by the texture names C++ assigns (data
 * textures for density-map sampling and the SMAA AreaTex/SearchTex lookup
 * tables). GfxManager composes one of these and forwards its peer-API texture
 * methods (createTexture / createDataTexture / bindTexture / unbindTexture /
 * deleteTexture) here; the public method names stay on GfxManager's prototype
 * for the C++ peer.
 *
 * Console signposts ("create texture OK") are E2E launch markers and are
 * intentionally preserved.
 */

import { benchCounters } from '../bench/benchCounters';

type GL = WebGL2RenderingContext;

/**
 * How many faces a coordinate texture cycles through.
 *
 * Two is enough to keep a write off the face the GPU is reading, which is the
 * whole point; a third would only help if a frame's draw outlived two of its
 * own updates, and the frame loop issues one update per draw.
 */
const COORD_TEX_RING = 2;

/**
 * Resource table for 2D textures.
 *
 * The GL context is injected via setContext once bindCanvas has acquired it.
 */
export class TextureStore {
    // 2D textures keyed by C++ texture name.
    private _tex_data: { [key: string]: WebGLTexture } = {};

    // Size of each mutable float texture (needed by updateFloatDataTexture's
    // texSubImage2D). Only populated for createFloatDataTexture entries.
    private _tex_size: { [key: string]: { width: number; height: number } } = {};

    ///
    /// The other faces of a float data texture, and which one is current.
    ///
    /// A coordinate texture is rewritten in full every frame while the GPU is
    /// still drawing from it, which is the one case where writing into a
    /// resource the GPU is reading costs real time: measured here, the same
    /// texSubImage2D of the same bytes went from 119 to 306 us on GroEL/GroES
    /// and from 346 to 874 on the ribosome once the CPU work that used to sit
    /// around it was removed and the write started landing inside the draw.
    /// So each name owns a small ring: the write goes to the next face and the
    /// draw binds it, leaving the one the GPU is still reading alone.
    ///
    /// Only these textures need it. The other kinds here are written once.
    ///
    private _tex_ring: { [key: string]: WebGLTexture[] } = {};
    private _tex_ring_pos: { [key: string]: number } = {};

    private _gl!: GL;

    /** Inject the WebGL2 context once it has been acquired in bindCanvas. */
    setContext(gl: GL): void {
        this._gl = gl;
    }

    /**
     * Create a single-channel (R8) 2D texture under `name` from `array_buf`,
     * with clamp-to-edge wrapping and nearest filtering. Returns false if
     * `name` is already taken.
     */
    createTexture(name: string, width: number, height: number, array_buf: any): boolean {
        if (name in this._tex_data) {
            console.log(`texture name ${name} already exists`);
            return false;
        }

        const gl = this._gl;
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
     * Create an immutable lookup texture (SMAA AreaTex/SearchTex).
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

        const gl = this._gl;
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

    /**
     * Create a mutable float data texture (RGB32F, NEAREST, clamp-to-edge).
     * Used for per-atom coordinate lookup from vertex shaders. ncomp is
     * currently limited to 3. Returns false if `name` is already taken or the
     * component count is unsupported.
     */
    createFloatDataTexture(name: string, width: number, height: number,
                           ncomp: number): boolean {
        if (name in this._tex_data) {
            console.log(`texture name ${name} already exists`);
            return false;
        }
        if (ncomp !== 3) {
            console.log(`createFloatDataTexture: unsupported ncomp ${ncomp}`);
            return false;
        }

        const gl = this._gl;
        const ring: WebGLTexture[] = [];
        for (let i = 0; i < COORD_TEX_RING; ++i) {
            const tex = gl.createTexture()!;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, width, height, 0,
                          gl.RGB, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.bindTexture(gl.TEXTURE_2D, null);
            ring.push(tex);
        }

        this._tex_ring[name] = ring;
        this._tex_ring_pos[name] = 0;
        // The current face is what bindTexture and deleteTexture see, so the
        // rest of this class needs to know nothing about the ring.
        this._tex_data[name] = ring[0];
        this._tex_size[name] = { width, height };
        console.log('create float data texture OK, name=', name, 'size=', width,
                    'x', height, 'ncomp=', ncomp, 'ring=', COORD_TEX_RING);
        return true;
    }

    /**
     * Replace the whole contents of a float data texture (RGB32F).
     *
     * Writes to the next face of the ring and makes it current, so the draw
     * that follows binds what was just written while the GPU finishes reading
     * the previous one.
     */
    updateFloatDataTexture(name: string, array_buf: any): boolean {
        const sz = this._tex_size[name];
        const ring = this._tex_ring[name];
        if (!ring || !sz) return false;
        const gl = this._gl;
        const pos = (this._tex_ring_pos[name] + 1) % ring.length;
        const tex = ring[pos];
        this._tex_ring_pos[name] = pos;
        this._tex_data[name] = tex;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // Ablation harness: texUpload is the texSubImage2D call alone.
        const view = new Float32Array(array_buf);
        const texUpload0 = benchCounters.now();
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sz.width, sz.height,
                         gl.RGB, gl.FLOAT, view);
        benchCounters.addTexUpload(benchCounters.now() - texUpload0);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return true;
    }

    bindTexture(name: string, texUnit: number): void {
        const gl = this._gl;
        const tex = this._tex_data[name];
        if (!tex) {
            throw `texture ${name} not found`;
        }
        gl.activeTexture(gl.TEXTURE0 + texUnit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
    }

    unbindTexture(): void {
        const gl = this._gl;
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    deleteTexture(name: string): boolean {
        const gl = this._gl;
        if (!(name in this._tex_data)) return false;
        const ring = this._tex_ring[name];
        if (ring) {
            for (const tex of ring) gl.deleteTexture(tex);
            delete this._tex_ring[name];
            delete this._tex_ring_pos[name];
        } else {
            gl.deleteTexture(this._tex_data[name]);
        }
        delete this._tex_data[name];
        delete this._tex_size[name];
        return true;
    }
}
