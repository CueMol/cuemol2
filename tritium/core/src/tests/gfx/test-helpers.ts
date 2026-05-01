/**
 * Shared test helpers for GFX color tests
 */

import { cm } from '../setup';
import type { Color } from '@/wrappers/Color';
import type { AbstractColor } from '@/wrappers/AbstractColor';
import type { StyleManager } from '@/wrappers/StyleManager';
import type { Scene } from '@/wrappers/Scene';

// ============================================================================
// Type Definitions
// ============================================================================

export type RGBA = { r: number; g: number; b: number; a?: number };

// ============================================================================
// Color Code Helpers
// ============================================================================

/**
 * Create RGBA code from individual channel values
 * RGBA code layout: (A << 24) | (R << 16) | (G << 8) | B
 */
export const RGBA_CODE = (r: number, g: number, b: number, a: number = 255): number =>
    ((a & 0xFF) << 24 | (r & 0xFF) << 16 | (g & 0xFF) << 8 | (b & 0xFF));

/**
 * Extract individual color channels from AbstractColor instance
 */
export const extractChannels = (color: AbstractColor): RGBA => ({
    r: color.r(),
    g: color.g(),
    b: color.b(),
    a: color.a(),
});

// ============================================================================
// Color Creation Helpers
// ============================================================================

/**
 * Create a Color (SolidColor) instance via CueMol factory
 */
export const createColor = (r?: number, g?: number, b?: number, a: number = 255): Color => {
    const c = cm.createObj('Color') as Color;
    if (r !== undefined && g !== undefined && b !== undefined) {
        c.setCode(RGBA_CODE(r, g, b, a));
    }
    return c;
};

// ============================================================================
// Color Compilation Helpers
// ============================================================================

/**
 * Compile color string and return tuple of [color, error]
 * Used for testing both success and failure cases
 * 
 * @param colorStr Color string to compile
 * @param stylem StyleManager instance
 * @param sceneUid Scene UID
 * @returns Tuple of [compiled color or null, error message or null]
 */
export const compileColor = (
    colorStr: string,
    stylem: StyleManager,
    sceneUid: number
): [AbstractColor | null, string | null] => {
    try {
        const color = stylem.compileColor(colorStr, sceneUid);
        // If compilation returns null, consider it a failure
        return [color, color === null ? 'failed' : null];
    } catch (e) {
        return [null, String(e)];
    }
};

/**
 * Compile color string and return Color object or null on error.
 * Does not throw - catches exceptions and returns null instead.
 * 
 * @param colorStr Color string to compile
 * @param stylem StyleManager instance
 * @param sceneUid Scene UID
 * @returns Compiled color or null
 */
export const compileColorSafe = (
    colorStr: string,
    stylem: StyleManager,
    sceneUid: number
): AbstractColor | null => {
    const [color] = compileColor(colorStr, stylem, sceneUid);
    return color;
};

// ============================================================================
// Test Assertion Helpers
// ============================================================================

/**
 * Assert that a color compilation succeeds
 * 
 * @param colorStr Color string to compile
 * @param stylem StyleManager instance
 * @param sceneUid Scene UID
 * @returns The compiled color (for chaining assertions)
 */
export const expectColorCompiles = (
    colorStr: string,
    stylem: StyleManager,
    sceneUid: number
): AbstractColor => {
    const [color, error] = compileColor(colorStr, stylem, sceneUid);
    expect(error).toBeNull();
    expect(color).not.toBeNull();
    return color!;
};

/**
 * Assert that a color compilation fails
 * 
 * @param colorStr Color string to compile
 * @param stylem StyleManager instance
 * @param sceneUid Scene UID
 */
export const expectColorFails = (
    colorStr: string,
    stylem: StyleManager,
    sceneUid: number
): void => {
    const [color, error] = compileColor(colorStr, stylem, sceneUid);
    expect(error !== null || color === null).toBe(true);
};

/**
 * Compile color string and assert channels match expected values.
 * 
 * @param colorStr Color string to compile
 * @param stylem StyleManager instance
 * @param sceneUid Scene UID
 * @param expected Expected RGBA values
 * @param options Configuration options
 * @param options.approximate Use toBeCloseTo for approximate matching (useful for HSB/converted values)
 */
export const expectCompiledColor = (
    colorStr: string,
    stylem: StyleManager,
    sceneUid: number,
    expected: RGBA,
    options?: { approximate?: boolean }
): void => {
    const color = expectColorCompiles(colorStr, stylem, sceneUid);
    const { r, g, b, a } = extractChannels(color);
    
    const assert = options?.approximate
        ? (actual: number, exp: number) => expect(actual).toBeCloseTo(exp, 0)
        : (actual: number, exp: number) => expect(actual).toBe(exp);
    
    assert(r, expected.r);
    assert(g, expected.g);
    assert(b, expected.b);
    if (expected.a !== undefined) {
        assert(a!, expected.a!);
    }
};

// ============================================================================
// Gradient Color Helpers
// ============================================================================

/**
 * Compute expected gradient value for a single channel.
 * Formula: int(v1 * rho + v2 * (1.0 - rho))
 * Special case: if v1 == v2, returns v1 directly.
 * 
 * @param v1 First color channel value
 * @param v2 Second color channel value
 * @param rho Interpolation factor (0.0 to 1.0)
 * @returns Interpolated channel value
 */
export const expectedGradValue = (v1: number, v2: number, rho: number): number => {
    if (v1 === v2) return v1;
    return Math.trunc(v1 * rho + v2 * (1.0 - rho));
};

// ============================================================================
// Test Setup Helpers
// ============================================================================

/**
 * Create and return StyleManager and Scene for tests
 * Call this in beforeAll() and store the results
 * 
 * @returns Object containing stylem and scene instances
 */
export const setupColorTestEnvironment = (): { stylem: StyleManager; scene: Scene } => {
    const stylem = cm.getService('StyleManager') as StyleManager;
    const scene = cm.createScene() as Scene;
    return { stylem, scene };
};
