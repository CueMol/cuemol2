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

type GL = WebGL2RenderingContext;

/**
 * Resource table for 2D textures.
 *
 * The GL context is injected via setContext once bindCanvas has acquired it.
 */
export class TextureStore {
    // 2D textures keyed by C++ texture name.
    private _tex_data: { [key: string]: WebGLTexture } = {};

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
        gl.deleteTexture(this._tex_data[name]);
        delete this._tex_data[name];
        return true;
    }
}
