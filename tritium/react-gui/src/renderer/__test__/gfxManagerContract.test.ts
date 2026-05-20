import { describe, it, expect } from 'vitest';
import { GfxManager } from '../worker/server/gfx_manager';

/**
 * Contract guard for GfxManager's public API surface.
 *
 * C++ (ElecDisplayContext and friends) invokes these methods *by string
 * name* via `cuemol.bindPeer`, so renaming or dropping any of them silently
 * breaks rendering with no compile-time error. Phase 3 of the react-gui
 * refactor retypes the WebGL surface of GfxManager (`any` → `WebGL2*`);
 * this test fails loudly if that refactor — or any later one — removes a
 * public entry point.
 */

const PUBLIC_METHODS = [
    // canvas / view lifecycle
    'bindCanvas', 'addView', 'removeView', 'activateView',
    'startViewLoop', 'stopViewLoop', 'setLogicalSize',
    // shader programs
    'createUBO', 'toShaderTypeID',
    'createShader', 'deleteShader', 'enableShader', 'disableShader',
    // uniforms / matrices / viewport
    'setUniformI', 'setUniformF', 'setMatrix', 'setViewport',
    'updateMatricesUBO', 'updateFogUBO', 'initDrawParamsUBO', 'updateDrawParamsUBO',
    'clear',
    // draw state
    'setCullFace', 'setFrontFace', 'setInvertColorBlend',
    // VBOs
    'createBuffer', 'drawBuffer', 'deleteBuffer',
    // textures
    'createTexture', 'bindTexture', 'unbindTexture', 'deleteTexture',
];

describe('GfxManager public API surface', () => {
    it('keeps every public method on the prototype', () => {
        const proto = GfxManager.prototype as unknown as Record<string, unknown>;
        for (const name of PUBLIC_METHODS) {
            expect(typeof proto[name]).toBe('function');
        }
    });

    it('exposes the `canvas` getter', () => {
        const desc = Object.getOwnPropertyDescriptor(GfxManager.prototype, 'canvas');
        expect(desc?.get).toBeTypeOf('function');
    });
});
