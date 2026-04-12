/**
 * Tests for color definition syntax in CueMol.
 * Reference: src/gfx/color_parser.yxx, src/gfx/color_scanner.lxx
 * 
 * Converted from tests/gfx_tests/test_color_syntax.py
 */

import type { Scene } from '@/wrappers/Scene';
import type { StyleManager } from '@/wrappers/StyleManager';
import {
    setupColorTestEnvironment,
    compileColor as compileColorHelper,
    expectColorCompiles,
    expectColorFails,
} from './test-helpers';
import {
    NAMED_COLORS,
    HTML_COLORS,
    RGB_COLORS,
    HSB_COLORS,
    MOLCOL_COLORS,
    MODIFIERS,
    EDGE_CASES,
    ALL_SYNTAX_CASES,
    filterValidCases,
    filterInvalidCases,
} from './test-data';

// ============================================================================
// Module-level setup
// ============================================================================

let stylem: StyleManager;
let scene: Scene;

beforeAll(() => {
    const env = setupColorTestEnvironment();
    stylem = env.stylem;
    scene = env.scene;
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wrapper for compileColor that uses module-level stylem and scene
 */
const compileColor = (colorStr: string) => 
    compileColorHelper(colorStr, stylem, scene.uid);

// ============================================================================
// Tests
// ============================================================================

describe('Color Syntax', () => {
    describe('color compilation', () => {
        it.each(ALL_SYNTAX_CASES)(
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
                'rgb(1.0, 0.0, 0.0)',
                'hsb(0, 1, 1)',
            ];

            for (const colorStr of testCases) {
                expectColorCompiles(colorStr, stylem, scene.uid);
            }
        });

        it('accepts all uppercase keywords', () => {
            const testCases = [
                'RGB(1.0, 0.0, 0.0)',
                'HSB(0, 1, 1)',
            ];

            for (const colorStr of testCases) {
                expectColorCompiles(colorStr, stylem, scene.uid);
            }
        });

        it('rejects mixed case keywords', () => {
            expectColorFails('Rgb(1.0, 0.0, 0.0)', stylem, scene.uid);
        });
    });

    describe('named colors', () => {
        it.each(filterValidCases(NAMED_COLORS))(
            'compiles valid named color "%s"',
            (colorStr) => {
                expectColorCompiles(colorStr, stylem, scene.uid);
            }
        );

        it.each(filterInvalidCases(NAMED_COLORS))(
            'rejects invalid named color "%s"',
            (colorStr) => {
                expectColorFails(colorStr, stylem, scene.uid);
            }
        );
    });

    describe('HTML hex colors', () => {
        it.each(filterValidCases(HTML_COLORS))(
            'compiles valid HTML color "%s"',
            (colorStr) => {
                expectColorCompiles(colorStr, stylem, scene.uid);
            }
        );

        it.each(filterInvalidCases(HTML_COLORS))(
            'rejects invalid HTML color "%s"',
            (colorStr) => {
                expectColorFails(colorStr, stylem, scene.uid);
            }
        );
    });

    describe('RGB colors', () => {
        it.each(filterValidCases(RGB_COLORS))(
            'compiles valid RGB color "%s"',
            (colorStr) => {
                expectColorCompiles(colorStr, stylem, scene.uid);
            }
        );

        it.each(filterInvalidCases(RGB_COLORS))(
            'rejects invalid RGB color "%s"',
            (colorStr) => {
                expectColorFails(colorStr, stylem, scene.uid);
            }
        );
    });

    describe('HSB colors', () => {
        it.each(filterValidCases(HSB_COLORS))(
            'compiles valid HSB color "%s"',
            (colorStr) => {
                expectColorCompiles(colorStr, stylem, scene.uid);
            }
        );

        it.each(filterInvalidCases(HSB_COLORS))(
            'rejects invalid HSB color "%s"',
            (colorStr) => {
                expectColorFails(colorStr, stylem, scene.uid);
            }
        );
    });

    describe('special color types', () => {
        it('compiles $molcol reference', () => {
            expectColorCompiles('$molcol', stylem, scene.uid);
        });

        it('rejects $molcol with space', () => {
            expectColorFails('$mol col', stylem, scene.uid);
        });
    });

    describe('color modifiers', () => {
        it.each(filterValidCases(MODIFIERS))(
            'compiles valid modifier syntax "%s"',
            (colorStr) => {
                expectColorCompiles(colorStr, stylem, scene.uid);
            }
        );

        it.each(filterInvalidCases(MODIFIERS))(
            'rejects invalid modifier syntax "%s"',
            (colorStr) => {
                expectColorFails(colorStr, stylem, scene.uid);
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
