/**
 * Tests for color definition syntax in CueMol.
 * Reference: src/gfx/color_parser.yxx, src/gfx/color_scanner.lxx
 * 
 * Converted from tests/gfx_tests/test_color_syntax.py
 */

import { cm } from '../setup';
import type { Scene } from '@/wrappers/Scene';
import type { StyleManager } from '@/wrappers/StyleManager';
import type { AbstractColor } from '@/wrappers/AbstractColor';

// ============================================================================
// Module-level setup
// ============================================================================

let stylem: StyleManager;
let scene: Scene;

beforeAll(() => {
    // Initialize services once for all tests
    stylem = cm.getService('StyleManager') as StyleManager;
    scene = cm.createScene() as Scene;
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compile color and return tuple of [color, error]
 * @param colorStr Color string to compile
 * @returns Tuple of [compiled color or null, error message or null]
 */
const compileColor = (colorStr: string): [AbstractColor | null, string | null] => {
    try {
        const color = stylem.compileColor(colorStr, scene.uid);
        // If compilation returns null, consider it a failure
        return [color, color === null ? 'failed' : null];
    } catch (e) {
        return [null, String(e)];
    }
};

// ============================================================================
// Test Cases: [color_string, should_succeed]
// ============================================================================

const NAMED_COLORS: Array<[string, boolean]> = [
    ['red', true],
    ['color_1', true],          // Underscore and number
    [' red', true],             // Whitespace
    ['color space', false],     // Invalid space
    ['red blue', false],        // Multiple tokens
];

const HTML_COLORS: Array<[string, boolean]> = [
    ['#fff', true],
    ['#ffffff', true],
    ['#AbC', true],             // Case variation
    ['#ggg', false],            // Invalid hex
];

const RGB_COLORS: Array<[string, boolean]> = [
    ['rgb(255, 0, 0)', true],
    ['rgb(1.0, 0.5, 0.0)', true],       // Float
    ['RGB(128, 128, 128)', true],       // Uppercase
    ['rgba(255, 0, 0, 0.5)', true],
    ['rgb(255, 0)', false],             // Wrong arg count
    ['rgb(255; 0; 0)', false],          // Wrong separator
];

const HSB_COLORS: Array<[string, boolean]> = [
    ['hsb(0.0, 1.0, 1.0)', true],
    ['HSB(120.0, 0.5, 0.5)', true],     // Uppercase
    ['hsba(240.0, 1.0, 1.0, 0.5)', true],
    ['hsb(0.0, 1.0)', false],           // Wrong arg count
];

const MOLCOL_COLORS: Array<[string, boolean]> = [
    ['$molcol', true],
    ['$mol col', false],                // Space
];

const MODIFIERS: Array<[string, boolean]> = [
    ['red{alpha: 0.5}', true],
    ['rgb(255, 0, 0){alpha: 0.5; brightness: 1.2}', true],
    ['red{alpha: 0.5', false],          // Missing brace
];

const EDGE_CASES: Array<[string, boolean]> = [
    ['', false],
    ['   ', false],
    ['Rgb(255, 0, 0)', false],          // Mixed case keyword
];

// Combine all test cases
const ALL_CASES = [
    ...NAMED_COLORS,
    ...HTML_COLORS,
    ...RGB_COLORS,
    ...HSB_COLORS,
    ...MOLCOL_COLORS,
    ...MODIFIERS,
    ...EDGE_CASES,
];

// ============================================================================
// Tests
// ============================================================================

describe('Color Syntax', () => {
    describe('color compilation', () => {
        it.each(ALL_CASES)(
            'handles "%s" (should %s)',
            (colorStr, shouldSucceed) => {
                const [color, error] = compileColor(colorStr);

                if (shouldSucceed) {
                    // Must compile successfully: no error and color exists
                    expect(error).toBeNull();
                    expect(color).not.toBeNull();
                } else {
                    // Should fail: either error or no color
                    // Don't check error message content - it may change in implementation
                    expect(error !== null || color === null).toBe(true);
                }
            }
        );
    });

    describe('case sensitivity', () => {
        it('accepts all lowercase keywords', () => {
            const testCases = [
                'rgb(255, 0, 0)',
                'hsb(0, 1, 1)',
            ];

            for (const colorStr of testCases) {
                const [color, error] = compileColor(colorStr);
                expect(error).toBeNull();
                expect(color).not.toBeNull();
            }
        });

        it('accepts all uppercase keywords', () => {
            const testCases = [
                'RGB(255, 0, 0)',
                'HSB(0, 1, 1)',
            ];

            for (const colorStr of testCases) {
                const [color, error] = compileColor(colorStr);
                expect(error).toBeNull();
                expect(color).not.toBeNull();
            }
        });

        it('rejects mixed case keywords', () => {
            const [color, error] = compileColor('Rgb(255, 0, 0)');
            
            // Mixed case should fail
            expect(color).toBeNull();
        });
    });

    describe('named colors', () => {
        it.each(NAMED_COLORS.filter(([_, shouldSucceed]) => shouldSucceed))(
            'compiles valid named color "%s"',
            (colorStr) => {
                const [color, error] = compileColor(colorStr);
                expect(error).toBeNull();
                expect(color).not.toBeNull();
            }
        );

        it.each(NAMED_COLORS.filter(([_, shouldSucceed]) => !shouldSucceed))(
            'rejects invalid named color "%s"',
            (colorStr) => {
                const [color, error] = compileColor(colorStr);
                expect(error !== null || color === null).toBe(true);
            }
        );
    });

    describe('HTML hex colors', () => {
        it.each(HTML_COLORS.filter(([_, shouldSucceed]) => shouldSucceed))(
            'compiles valid HTML color "%s"',
            (colorStr) => {
                const [color, error] = compileColor(colorStr);
                expect(error).toBeNull();
                expect(color).not.toBeNull();
            }
        );

        it.each(HTML_COLORS.filter(([_, shouldSucceed]) => !shouldSucceed))(
            'rejects invalid HTML color "%s"',
            (colorStr) => {
                const [color, error] = compileColor(colorStr);
                expect(error !== null || color === null).toBe(true);
            }
        );
    });

    describe('RGB colors', () => {
        it.each(RGB_COLORS.filter(([_, shouldSucceed]) => shouldSucceed))(
            'compiles valid RGB color "%s"',
            (colorStr) => {
                const [color, error] = compileColor(colorStr);
                expect(error).toBeNull();
                expect(color).not.toBeNull();
            }
        );

        it.each(RGB_COLORS.filter(([_, shouldSucceed]) => !shouldSucceed))(
            'rejects invalid RGB color "%s"',
            (colorStr) => {
                const [color, error] = compileColor(colorStr);
                expect(error !== null || color === null).toBe(true);
            }
        );
    });

    describe('HSB colors', () => {
        it.each(HSB_COLORS.filter(([_, shouldSucceed]) => shouldSucceed))(
            'compiles valid HSB color "%s"',
            (colorStr) => {
                const [color, error] = compileColor(colorStr);
                expect(error).toBeNull();
                expect(color).not.toBeNull();
            }
        );

        it.each(HSB_COLORS.filter(([_, shouldSucceed]) => !shouldSucceed))(
            'rejects invalid HSB color "%s"',
            (colorStr) => {
                const [color, error] = compileColor(colorStr);
                expect(error !== null || color === null).toBe(true);
            }
        );
    });

    describe('special color types', () => {
        it('compiles $molcol reference', () => {
            const [color, error] = compileColor('$molcol');
            expect(error).toBeNull();
            expect(color).not.toBeNull();
        });

        it('rejects $molcol with space', () => {
            const [color, error] = compileColor('$mol col');
            expect(error !== null || color === null).toBe(true);
        });
    });

    describe('color modifiers', () => {
        it.each(MODIFIERS.filter(([_, shouldSucceed]) => shouldSucceed))(
            'compiles valid modifier syntax "%s"',
            (colorStr) => {
                const [color, error] = compileColor(colorStr);
                expect(error).toBeNull();
                expect(color).not.toBeNull();
            }
        );

        it.each(MODIFIERS.filter(([_, shouldSucceed]) => !shouldSucceed))(
            'rejects invalid modifier syntax "%s"',
            (colorStr) => {
                const [color, error] = compileColor(colorStr);
                expect(error !== null || color === null).toBe(true);
            }
        );
    });

    describe('edge cases', () => {
        it.each(EDGE_CASES)(
            'handles edge case "%s" (should %s)',
            (colorStr, shouldSucceed) => {
                const [color, error] = compileColor(colorStr);

                if (shouldSucceed) {
                    expect(error).toBeNull();
                    expect(color).not.toBeNull();
                } else {
                    expect(error !== null || color === null).toBe(true);
                }
            }
        );
    });
});
