/**
 * Integration tests for StyleManager.compileColor()
 *
 * Tests that color strings are correctly parsed and compiled into Color objects
 * with the expected RGB/RGBA values. This complements:
 * - color-syntax.test.py: Syntax validation (pass/fail only)
 * - Color.test.ts: Color object functionality tests
 */

import { cm } from '../setup';
import { Color } from '@/wrappers/Color';
import type { StyleManager } from '@/wrappers/StyleManager';
import type { Scene } from '@/wrappers/Scene';
import { AbstractColor } from '@/wrappers/AbstractColor';
import { MolColorRef } from '@/wrappers/MolColorRef';
import { NamedColor } from '@/wrappers/NamedColor';
import {
    setupColorTestEnvironment,
    compileColorSafe,
    expectCompiledColor,
    extractChannels,
} from './test-helpers';

// ============================================================================
// Test Suite
// ============================================================================

describe('compileColor (StyleManager)', () => {
    let stylem: StyleManager;
    let scene: Scene;
    let sceneUid: number;

    beforeAll(() => {
        const env = setupColorTestEnvironment();
        stylem = env.stylem;
        scene = env.scene;
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
            expectCompiledColor(colorStr, stylem, sceneUid, {
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
            expectCompiledColor(colorStr, stylem, sceneUid, {
                r: expR,
                g: expG,
                b: expB,
                a: expA,
            });
        });
    });

    // ========================================================================
    // RGB/RGBA Color Tests
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
                expectCompiledColor(colorStr, stylem, sceneUid, {
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
                colorStr,
                stylem,
                sceneUid,
                { r: expR, g: expG, b: expB },
                { approximate: true }
            );
        });

        it('parses HSBA with alpha channel correctly', () => {
            expectCompiledColor('hsba(0.0, 1.0, 1.0, 0.5)', stylem, sceneUid, {
                r: 255,
                g: 0,
                b: 0,
                a: 128, // 0.5 * 255 = 127.5 → 128
            });
        });
    });

    // ========================================================================
    // Returned wrapper type tests (Color/NamedColor/MolColorRef)
    // ========================================================================

    describe('returned wrapper types', () => {
        it('#RRGGBB returns Color', () => {
            const col = compileColorSafe('#112233', stylem, sceneUid);
            expect(col).not.toBeNull();
            expect(col).toBeInstanceOf(Color);
            expect(col!.getClassName()).toBe('Color');
        });

        it('rgb() returns Color', () => {
            const col = compileColorSafe('rgb(0.1, 0.2, 0.3)', stylem, sceneUid);
            expect(col).not.toBeNull();
            expect(col).toBeInstanceOf(Color);
            expect(col!.getClassName()).toBe('Color');
        });

        it('hsb() returns Color', () => {
            const col = compileColorSafe('hsb(0.0, 1.0, 1.0)', stylem, sceneUid);
            expect(col).not.toBeNull();
            expect(col).toBeInstanceOf(Color);
            expect(col!.getClassName()).toBe('Color');
        });

        it('named color returns NamedColor', () => {
            const col = compileColorSafe('red', stylem, sceneUid);
            expect(col).not.toBeNull();
            expect(col).toBeInstanceOf(NamedColor);
            expect(col!.getClassName()).toBe('NamedColor');
        });

        it('$molcol returns MolColorRef', () => {
            const col = compileColorSafe('$molcol', stylem, sceneUid);
            expect(col).not.toBeNull();
            expect(col).toBeInstanceOf(MolColorRef);
            expect(col!.getClassName()).toBe('MolColorRef');
        });
    });

    // ========================================================================
    // Color Modifiers Tests
    // ========================================================================

    describe('color modifiers ({alpha: ..., material: ...})', () => {
        describe('alpha modifier', () => {
            it.each([
                ['#ff0000{alpha: 1.0}', 255, 0, 0, 255, 'opaque'],
                ['#ff0000{alpha: 0.5}', 255, 0, 0, 128, 'semi-transparent'],
                ['#ff0000{alpha: 0.0}', 255, 0, 0, 0, 'fully transparent'],
                ['rgb(0.0, 1.0, 0.0){alpha: 0.75}', 0, 255, 0, 191, 'RGB with alpha'],
                ['hsb(0.0, 1.0, 1.0){alpha: 0.5}', 255, 0, 0, 128, 'HSB with alpha'],
                ['red{alpha: 0.25}', 255, 0, 0, 64, 'named color with alpha'],
            ])('applies alpha to %s correctly (%s)', (colorStr, expR, expG, expB, expA) => {
                expectCompiledColor(colorStr, stylem, sceneUid, {
                    r: expR,
                    g: expG,
                    b: expB,
                    a: expA,
                }, { approximate: true });
            });
        });

        describe('named color modifiers (mod_h/mod_s/mod_b)', () => {
            it('supports mod_h for named colors', () => {
                const base = compileColorSafe('red', stylem, sceneUid);
                const modified = compileColorSafe('red{mod_h: 120.0}', stylem, sceneUid);
                expect(base).not.toBeNull();
                expect(modified).not.toBeNull();
                expect(modified).toBeInstanceOf(NamedColor);
                expect((modified as NamedColor).mod_h).toBeCloseTo(120.0, 6);

                const baseCh = extractChannels(base!);
                const modCh = extractChannels(modified!);
                // Hue shift from red should increase green channel
                expect(modCh.g).toBeGreaterThan(baseCh.g);
            });

            it('supports mod_s for named colors', () => {
                const base = compileColorSafe('red', stylem, sceneUid);
                const desaturated = compileColorSafe('red{mod_s: -0.5}', stylem, sceneUid);
                expect(base).not.toBeNull();
                expect(desaturated).not.toBeNull();
                expect(desaturated).toBeInstanceOf(NamedColor);
                expect((desaturated as NamedColor).mod_s).toBeCloseTo(-0.5, 6);

                const baseCh = extractChannels(base!);
                const desatCh = extractChannels(desaturated!);
                // With red (r=255) and brightness kept high, lowering saturation can keep r saturated
                // while increasing g/b (moving toward gray).
                expect(desatCh.r).toBe(baseCh.r);
                expect(desatCh.g).toBeGreaterThan(baseCh.g);
                expect(desatCh.b).toBeGreaterThan(baseCh.b);
            });

            it('supports mod_b for named colors', () => {
                const base = compileColorSafe('gray', stylem, sceneUid);
                const brighter = compileColorSafe('gray{mod_b: 0.2}', stylem, sceneUid);
                const darker = compileColorSafe('gray{mod_b: -0.2}', stylem, sceneUid);
                expect(base).not.toBeNull();
                expect(brighter).not.toBeNull();
                expect(darker).not.toBeNull();
                expect(brighter).toBeInstanceOf(NamedColor);
                expect(darker).toBeInstanceOf(NamedColor);
                expect((brighter as NamedColor).mod_b).toBeCloseTo(0.2, 6);
                expect((darker as NamedColor).mod_b).toBeCloseTo(-0.2, 6);

                const baseCh = extractChannels(base!);
                const brightCh = extractChannels(brighter!);
                const darkCh = extractChannels(darker!);
                expect(brightCh.r).toBeGreaterThan(baseCh.r);
                expect(brightCh.g).toBeGreaterThan(baseCh.g);
                expect(brightCh.b).toBeGreaterThan(baseCh.b);
                expect(darkCh.r).toBeLessThan(baseCh.r);
                expect(darkCh.g).toBeLessThan(baseCh.g);
                expect(darkCh.b).toBeLessThan(baseCh.b);
            });
        });

        describe('material modifier', () => {
            it('sets material property for RGB colors', () => {
                const color = compileColorSafe('rgb(1.0, 0.0, 0.0){material: shiny}', stylem, sceneUid);
                expect(color).not.toBeNull();
                expect((color as any).material).toBe('shiny');
            });

            it('sets material property for HSB colors', () => {
                const color = compileColorSafe('hsb(0.0, 1.0, 1.0){material: matte}', stylem, sceneUid);
                expect(color).not.toBeNull();
                expect((color as any).material).toBe('matte');
            });

            it('sets material property for hex colors', () => {
                const color = compileColorSafe('#ff0000{material: glossy}', stylem, sceneUid);
                expect(color).not.toBeNull();
                expect((color as any).material).toBe('glossy');
            });

            it('sets material property for named colors', () => {
                const color = compileColorSafe('red{material: metallic}', stylem, sceneUid);
                expect(color).not.toBeNull();
                expect((color as any).material).toBe('metallic');
            });
        });

        describe('combined modifiers', () => {
            it('applies alpha and material together', () => {
                const color = compileColorSafe(
                    'rgb(0.39, 0.59, 0.78){alpha: 0.5; material: shiny}',
                    stylem,
                    sceneUid
                );
                expect(color).not.toBeNull();
                const { a } = extractChannels(color!);
                expect(a).toBeCloseTo(128, 0); // 0.5 * 255
                expect((color as any).material).toBe('shiny');
            });
        });
    });

    // ========================================================================
    // MolColorRef Tests ($molcol)
    // ========================================================================

    describe('$molcol reference', () => {
        it('creates a MolColorRef instance from "$molcol"', () => {
            const color = compileColorSafe('$molcol', stylem, sceneUid);
            expect(color).not.toBeNull();
            expect(color).toBeInstanceOf(MolColorRef);
            expect(color!.getClassName()).toBe('MolColorRef');

            // MolColorRef returns a fixed debug color (0x7f) for channels
            expectCompiledColor('$molcol', stylem, sceneUid, { r: 0x7f, g: 0x7f, b: 0x7f, a: 0x7f });
        });

        it('accepts alpha/material/mod_h/mod_s/mod_b modifiers on "$molcol"', () => {
            const color = compileColorSafe(
                '$molcol{alpha: 0.5; material: shiny; mod_h: 30.0; mod_s: 0.1; mod_b: -0.2}',
                stylem,
                sceneUid
            );
            expect(color).not.toBeNull();
            expect(color).toBeInstanceOf(MolColorRef);
            const mcol = color as MolColorRef;
            expect(mcol.alpha).toBeCloseTo(0.5, 6);
            expect(mcol.material).toBe('shiny');
            expect(mcol.mod_h).toBeCloseTo(30.0, 6);
            expect(mcol.mod_s).toBeCloseTo(0.1, 6);
            expect(mcol.mod_b).toBeCloseTo(-0.2, 6);
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
            const compiled = compileColorSafe(colorStr, stylem, sceneUid) as Color | null;
            expect(compiled).not.toBeNull();
            const direct = cm.createObj('Color') as Color;
            setupDirect(direct);
            expect(compiled!.code).toBe(direct.code);
        });
    });
});
