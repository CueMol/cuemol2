/**
 * Integration tests for StyleManager.compileColor()
 *
 * Tests that color strings are correctly parsed and compiled into Color objects
 * with the expected RGB/RGBA values. This complements:
 * - color-syntax.test.py: Syntax validation (pass/fail only)
 * - Color.test.ts: Color object functionality tests
 */

import { cm } from '../setup';
import type { Color } from '@/wrappers/Color';
import type { StyleManager } from '@/wrappers/StyleManager';
import type { Scene } from '@/wrappers/Scene';
import { AbstractColor } from '@/wrappers/AbstractColor';

// ============================================================================
// Test Helpers
// ============================================================================

type RGBA = { r: number; g: number; b: number; a?: number };

/** Extract individual color channels from RGBA code */
const extractChannels = (color: AbstractColor): RGBA => ({
    r: color.r(),
    g: color.g(),
    b: color.b(),
    a: color.a(),
});

/**
 * Compile color string and return Color object or null on error.
 * Does not throw - catches exceptions and returns null instead.
 */
const compileColor = (
    stylem: StyleManager,
    sceneUid: number,
    colorStr: string
): Color | null => {
    try {
        const color = stylem.compileColor(colorStr, sceneUid);
        return color || null;
    } catch {
        return null;
    }
};

/**
 * Compile color string and assert channels match expected values.
 * Use approximate: true for HSB/converted values (uses toBeCloseTo).
 */
const expectCompiledColor = (
    stylem: StyleManager,
    sceneUid: number,
    colorStr: string,
    expected: RGBA,
    options?: { approximate?: boolean }
): void => {
    const color = compileColor(stylem, sceneUid, colorStr);
    expect(color).not.toBeNull();
    const { r, g, b, a } = extractChannels(color!);
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
// Test Suite
// ============================================================================

describe('compileColor (StyleManager)', () => {
    let stylem: StyleManager;
    let scene: Scene;
    let sceneUid: number;

    beforeAll(() => {
        // Initialize services once for all tests
        stylem = cm.getService('StyleManager') as StyleManager;
        scene = cm.createScene() as Scene;
        sceneUid = scene.uid;
    });

    afterAll(() => {
        // Cleanup scene after all tests
        if (scene) {
            // scene.destruct();
        }
    });

    // ========================================================================
    // Named Color Tests (HTML standard color names)
    // ========================================================================

    describe('named colors', () => {
        it.each([
            ['red', 255, 0, 0, 255],
            ['green', 0, 128, 0, 255],
            ['blue', 0, 0, 255, 255],
            ['white', 255, 255, 255, 255],
            ['black', 0, 0, 0, 255],
            ['yellow', 255, 255, 0, 255],
            ['cyan', 0, 255, 255, 255],
            ['magenta', 255, 0, 255, 255],
            ['gray', 128, 128, 128, 255],
            ['orange', 255, 165, 0, 255],
            ['purple', 128, 0, 128, 255],
            ['pink', 255, 192, 203, 255],
        ])('parses "%s" correctly', (colorStr, expR, expG, expB, expA) => {
            expectCompiledColor(stylem, sceneUid, colorStr, {
                r: expR,
                g: expG,
                b: expB,
                a: expA,
            });
        });
    });

    // ========================================================================
    // HTML Color Tests
    // ========================================================================

    describe('HTML color syntax (#RGB, #RRGGBB)', () => {
        it.each([
            ['#fff', 255, 255, 255, 255, 'white shorthand'],
            ['#000', 0, 0, 0, 255, 'black shorthand'],
            ['#f00', 255, 0, 0, 255, 'red shorthand'],
            ['#0f0', 0, 255, 0, 255, 'green shorthand'],
            ['#00f', 0, 0, 255, 255, 'blue shorthand'],
            ['#abc', 170, 187, 204, 255, 'mixed shorthand'],
            ['#ffffff', 255, 255, 255, 255, 'white full'],
            ['#000000', 0, 0, 0, 255, 'black full'],
            ['#ff0000', 255, 0, 0, 255, 'red full'],
            ['#00ff00', 0, 255, 0, 255, 'green full'],
            ['#0000ff', 0, 0, 255, 255, 'blue full'],
            ['#AbCdEf', 171, 205, 239, 255, 'mixed case'],
            ['#123456', 18, 52, 86, 255, 'arbitrary hex'],
        ])('parses %s correctly (%s)', (colorStr, expR, expG, expB, expA) => {
            expectCompiledColor(stylem, sceneUid, colorStr, {
                r: expR,
                g: expG,
                b: expB,
                a: expA,
            });
        });
    });

    // ========================================================================
    // RGB/RGBA Color Tests (components are 0.0–1.0 only; 0–255 like HTML is not supported)
    // ========================================================================

    describe('RGB/RGBA syntax (rgb(r,g,b), rgba(r,g,b,a))', () => {
        describe('floating-point RGB values (0.0-1.0)', () => {
            it.each([
                ['rgb(1.0, 0.0, 0.0)', 255, 0, 0, 'red'],
                ['rgb(0.0, 1.0, 0.0)', 0, 255, 0, 'green'],
                ['rgb(0.0, 0.0, 1.0)', 0, 0, 255, 'blue'],
                ['rgb(0.5, 0.5, 0.5)', 128, 128, 128, 'gray (0.5 → 128)'],
                ['rgb(0.25, 0.5, 0.75)', 64, 128, 191, 'mixed floats'],
            ])('parses %s correctly (%s)', (colorStr, expR, expG, expB) => {
                expectCompiledColor(stylem, sceneUid, colorStr, {
                    r: expR,
                    g: expG,
                    b: expB,
                });
            });
        });
    });

    // ========================================================================
    // HSB/HSBA Color Tests
    // ========================================================================

    describe('HSB/HSBA syntax (hsb(h,s,b), hsba(h,s,b,a))', () => {
        it.each([
            // Format: [colorStr, hue, sat, bri, expR, expG, expB, description]
            ['hsb(0.0, 1.0, 1.0)', 0.0, 1.0, 1.0, 255, 0, 0, 'red (hue=0)'],
            ['hsb(120.0, 1.0, 1.0)', 120.0, 1.0, 1.0, 0, 255, 0, 'green (hue=120)'],
            ['hsb(240.0, 1.0, 1.0)', 240.0, 1.0, 1.0, 0, 0, 255, 'blue (hue=240)'],
            ['HSB(60.0, 1.0, 1.0)', 60.0, 1.0, 1.0, 255, 255, 0, 'yellow (uppercase)'],
            ['hsb(0.0, 0.0, 1.0)', 0.0, 0.0, 1.0, 255, 255, 255, 'white (sat=0)'],
            ['hsb(0.0, 0.0, 0.0)', 0.0, 0.0, 0.0, 0, 0, 0, 'black (bri=0)'],
            ['hsb(0.0, 1.0, 0.5)', 0.0, 1.0, 0.5, 128, 0, 0, 'dark red (bri=0.5)'],
        ])('parses %s correctly (%s)', (colorStr, _h, _s, _b, expR, expG, expB) => {
            expectCompiledColor(
                stylem,
                sceneUid,
                colorStr,
                { r: expR, g: expG, b: expB },
                { approximate: true }
            );
        });

        it('parses HSBA with alpha channel correctly', () => {
            expectCompiledColor(stylem, sceneUid, 'hsba(0.0, 1.0, 1.0, 0.5)', {
                r: 255,
                g: 0,
                b: 0,
                a: 128, // 0.5 * 255 = 127.5 → 128
            });
        });
    });

    // ========================================================================
    // Color Modifiers Tests
    // ========================================================================

    describe('color modifiers ({alpha: ..., brightness: ...})', () => {
        describe('alpha modifier', () => {
            it.each([
                ['#ff0000{alpha: 1.0}', 255, 0, 0, 255, 'opaque'],
                ['#ff0000{alpha: 0.5}', 255, 0, 0, 128, 'semi-transparent'],
                ['#ff0000{alpha: 0.0}', 255, 0, 0, 0, 'fully transparent'],
                ['rgb(0.0, 1.0, 0.0){alpha: 0.75}', 0, 255, 0, 191, 'RGB with alpha'],
            ])('applies alpha to %s correctly (%s)', (colorStr, expR, expG, expB, expA) => {
                expectCompiledColor(stylem, sceneUid, colorStr, {
                    r: expR,
                    g: expG,
                    b: expB,
                    a: expA,
                }, { approximate: true });
            });
        });

        describe('brightness modifier', () => {
            const baseGray = 'rgb(0.5, 0.5, 0.5)';

            it('increases brightness for values > 1.0', () => {
                const base = compileColor(stylem, sceneUid, baseGray);
                const bright = compileColor(stylem, sceneUid, `${baseGray}{brightness: 1.5}`);
                expect(base).not.toBeNull();
                expect(bright).not.toBeNull();
                const bCh = extractChannels(base!);
                const rCh = extractChannels(bright!);
                expect(rCh.r).toBeGreaterThan(bCh.r);
                expect(rCh.g).toBeGreaterThan(bCh.g);
                expect(rCh.b).toBeGreaterThan(bCh.b);
            });

            it('decreases brightness for values < 1.0', () => {
                const base = compileColor(stylem, sceneUid, baseGray);
                const dark = compileColor(stylem, sceneUid, `${baseGray}{brightness: 0.5}`);
                expect(base).not.toBeNull();
                expect(dark).not.toBeNull();
                const bCh = extractChannels(base!);
                const dCh = extractChannels(dark!);
                expect(dCh.r).toBeLessThan(bCh.r);
                expect(dCh.g).toBeLessThan(bCh.g);
                expect(dCh.b).toBeLessThan(bCh.b);
            });
        });

        describe('combined modifiers', () => {
            it('applies both alpha and brightness modifiers', () => {
                const color = compileColor(
                    stylem,
                    sceneUid,
                    'rgb(0.39, 0.59, 0.78){alpha: 0.5; brightness: 1.2}' // ≈ (100,150,200)/255
                );
                expect(color).not.toBeNull();
                const { a } = extractChannels(color!);
                expect(a).toBeCloseTo(128, 0); // 0.5 * 255
            });
        });
    });

    // ========================================================================
    // Integration Tests: Comparing with Direct Color Creation
    // ========================================================================

    describe('integration: compiled colors match direct Color creation', () => {
        it.each([
            ['#ff0000', (c: Color) => c.setRGBA(1.0, 0.0, 0.0, 1.0)],
            ['rgb(0.0, 1.0, 0.0)', (c: Color) => c.setRGB(0.0, 1.0, 0.0)],
            ['hsb(0.0, 1.0, 1.0)', (c: Color) => c.setHSB(0.0, 1.0, 1.0)],
        ])('compileColor("%s") matches direct Color', (colorStr, setupDirect) => {
            const compiled = compileColor(stylem, sceneUid, colorStr);
            expect(compiled).not.toBeNull();
            const direct = cm.createObj('Color') as Color;
            setupDirect(direct);
            expect(compiled!.code).toBe(direct.code);
        });
    });
});
