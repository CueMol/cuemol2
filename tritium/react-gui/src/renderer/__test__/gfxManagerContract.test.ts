import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GfxManager } from '../worker/server/gfx_manager';

/**
 * Contract guard for GfxManager's peer API surface.
 *
 * C++ (ElecDisplayContext, EcRenderTarget, EcShaderObject, EcBufferRep,
 * EcDataTexture, ...) invokes a fixed set of GfxManager methods *by string
 * name* via `peer.Get("name")`, so renaming or dropping any of them silently
 * breaks rendering with no compile-time error. A future split or `any` ->
 * `WebGL2*` retype of GfxManager would pass the type checker but lose the
 * runtime wiring.
 *
 * Self-maintaining design:
 * - Each peer-invoked method in gfx_manager.ts carries a `/// API` marker
 *   comment immediately above its declaration. This test re-parses the source
 *   at run time to derive the *current* marked set.
 * - `EXPECTED_PEER_API` is the authoritative list of names C++ actually calls
 *   (grepped from `tritium/core/cxx_src/` -- every `peer.Get("...")` on the gfx
 *   peer). The test asserts the marked set equals it exactly, so:
 *     - adding a marker without listing the name here -> fails (catches a new
 *       peer method that is not yet known to be wired),
 *     - removing/renaming a marked method without updating the marker -> the
 *       derived set shrinks/changes -> fails,
 *     - dropping a name C++ still calls -> the prototype check below fails.
 *
 * To regenerate EXPECTED_PEER_API: grep `tritium/core/cxx_src/` for every
 * `peer.Get("...")` name on the gfx peer, dedupe, and sort.
 */

/**
 * Names C++ invokes on the gfx peer by string. Sourced from
 * `tritium/core/cxx_src/*.cpp` (`peer.Get("...")`). Keep sorted.
 */
const EXPECTED_PEER_API = [
    'bindDefaultFramebuffer',
    'bindFBOTexture',
    'bindFramebuffer',
    'bindTexture',
    'blitDepthToDefault',
    'clear',
    'clearRenderTarget',
    'createBuffer',
    'createDataTexture',
    'createFloatDataTexture',
    'createFramebuffer',
    'createShader',
    'createTexture',
    'deleteBuffer',
    'deleteFramebuffer',
    'deleteShader',
    'deleteTexture',
    'disableShader',
    'drawBuffer',
    'enableShader',
    'initDrawParamsUBO',
    'readPixels',
    'setBlendEnabled',
    'setBlendModeAdd',
    'setCullFace',
    'setDepthTestEnabled',
    'setFrontFace',
    'setInvertColorBlend',
    'setMatrix',
    'setUniformF',
    'setUniformI',
    'setViewport',
    'unbindTexture',
    'updateDrawParamsUBO',
    'updateFloatDataTexture',
    'updateFogUBO',
    'updateMatricesUBO',
] as const;

/**
 * Worker-internal entry points: not invoked from C++ by string, but called by
 * WorkerService (view lifecycle / shared UBO setup) and equally fatal if
 * renamed. Pinned separately so the C++-derived check stays exact.
 */
const WORKER_INTERNAL_METHODS = [
    'bindCanvas', 'addView', 'removeView', 'activateView',
    'startViewLoop', 'stopViewLoop', 'setLogicalSize',
    'createUBO', 'toShaderTypeID',
] as const;

/**
 * Parse gfx_manager.ts and return the set of method names that carry a
 * `/// API` marker comment on the line(s) immediately above their declaration.
 * A JSDoc block may sit between the marker and the declaration.
 */
function deriveMarkedPeerMethods(): string[] {
    // Vitest runs with cwd at the react-gui package root.
    const src = readFileSync(
        resolve(process.cwd(), 'src/renderer/worker/server/gfx_manager.ts'),
        'utf8',
    );
    const lines = src.split('\n');
    const marked: string[] = [];
    let pending = false;
    for (const line of lines) {
        if (/^\s*\/\/\/\s*API/.test(line)) {
            pending = true;
            continue;
        }
        if (!pending) continue;
        // Method declaration at class-body indent (4 spaces).
        const m = line.match(/^    ([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (m) {
            marked.push(m[1]);
            pending = false;
        } else if (/^\s*\/[/*]/.test(line) || line.trim() === '') {
            // Allow a JSDoc/comment block or blank lines between the marker
            // and the declaration without losing the pending state.
            continue;
        } else {
            pending = false;
        }
    }
    return marked;
}

describe('GfxManager peer API surface', () => {
    it('keeps every C++-invoked peer method on the prototype', () => {
        const proto = GfxManager.prototype as unknown as Record<string, unknown>;
        for (const name of EXPECTED_PEER_API) {
            expect(typeof proto[name], `peer method ${name} missing from prototype`)
                .toBe('function');
        }
    });

    it('keeps every worker-internal method on the prototype', () => {
        const proto = GfxManager.prototype as unknown as Record<string, unknown>;
        for (const name of WORKER_INTERNAL_METHODS) {
            expect(typeof proto[name], `worker-internal method ${name} missing`)
                .toBe('function');
        }
    });

    it('exposes the `canvas` getter', () => {
        const desc = Object.getOwnPropertyDescriptor(GfxManager.prototype, 'canvas');
        expect(desc?.get).toBeTypeOf('function');
    });

    // Self-maintaining guard: the `/// API` markers in gfx_manager.ts must
    // stay in 1:1 sync with the names C++ actually calls. If a future edit
    // adds a public peer method (and marks it) without updating
    // EXPECTED_PEER_API, or removes/renames a marked method, this fails --
    // the allowlist cannot silently fall behind the source.
    it('marked /// API methods match the C++-invoked peer set exactly', () => {
        const marked = [...new Set(deriveMarkedPeerMethods())].sort();
        const expected = [...EXPECTED_PEER_API].sort();
        expect(marked).toEqual(expected);
    });

    it('every marked /// API method exists on the prototype', () => {
        const proto = GfxManager.prototype as unknown as Record<string, unknown>;
        for (const name of deriveMarkedPeerMethods()) {
            expect(typeof proto[name], `marked method ${name} missing from prototype`)
                .toBe('function');
        }
    });
});
