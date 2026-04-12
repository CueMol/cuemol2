import { cm } from '../setup';
import type { Color } from '@/wrappers/Color';
import type { GradientColor } from '@/wrappers/GradientColor';
import { RGBA_CODE, createColor, expectedGradValue } from './test-helpers';

// ============================================================================
// Constants
// ============================================================================

/** Default value for rho property (from QIF: default rho = 0.0) */
const DEFAULT_RHO = 0.0;

// ============================================================================
// Helpers
// ============================================================================

/** Create a GradientColor instance */
const createGradientColor = (): GradientColor => {
    return cm.createObj('GradientColor') as GradientColor;
};

/**
 * Create a GradientColor initialized with two solid colors and a rho value.
 */
const createInitializedGradient = (
    r1: number, g1: number, b1: number,
    r2: number, g2: number, b2: number,
    rho: number,
    a1: number = 255,
    a2: number = 255,
): GradientColor => {
    const gc = createGradientColor();
    gc.col1 = createColor(r1, g1, b1, a1);
    gc.col2 = createColor(r2, g2, b2, a2);
    gc.rho = rho;
    return gc;
};

// ============================================================================
// Tests
// ============================================================================

describe('GradientColor', () => {
    let sut: GradientColor;

    beforeEach(() => {
        sut = createGradientColor();
    });

    describe('object creation', () => {
        it('creates instance successfully', () => {
            expect(sut).toBeTruthy();
        });

        it('has default rho value of 0.0', () => {
            expect(sut.rho).toBe(DEFAULT_RHO);
        });
    });

    describe('rho property', () => {
        it('sets and gets rho', () => {
            sut.rho = 0.5;

            expect(sut.rho).toBe(0.5);
        });

        it.each([0.0, 0.25, 0.5, 0.75, 1.0])(
            'accepts rho value %s', (value) => {
                sut.rho = value;

                expect(sut.rho).toBeCloseTo(value, 10);
            }
        );

        it('accepts negative rho values', () => {
            sut.rho = -0.5;

            expect(sut.rho).toBe(-0.5);
        });

        it('accepts rho values greater than 1.0', () => {
            sut.rho = 2.0;

            expect(sut.rho).toBe(2.0);
        });

        it('has default value and supports resetProp', () => {
            expect(sut.hasPropDefault('rho')).toBe(true);

            sut.rho = 0.75;
            expect(sut.rho).toBe(0.75);

            sut.resetProp('rho');
            expect(sut.rho).toBe(DEFAULT_RHO);
        });
    });

    describe('col1 and col2 properties', () => {
        it('sets and gets col1', () => {
            const c = createColor(255, 0, 0);
            sut.col1 = c;

            const retrieved = sut.col1 as Color;
            expect(retrieved.code).toBe(c.code);
        });

        it('sets and gets col2', () => {
            const c = createColor(0, 0, 255);
            sut.col2 = c;

            const retrieved = sut.col2 as Color;
            expect(retrieved.code).toBe(c.code);
        });

        it('maintains independent col1 and col2', () => {
            const red = createColor(255, 0, 0);
            const blue = createColor(0, 0, 255);

            sut.col1 = red;
            sut.col2 = blue;

            expect((sut.col1 as Color).code).toBe(red.code);
            expect((sut.col2 as Color).code).toBe(blue.code);
        });

        it('allows replacing col1 without affecting col2', () => {
            sut.col1 = createColor(255, 0, 0);
            sut.col2 = createColor(0, 255, 0);

            const green = createColor(0, 128, 0);
            sut.col1 = green;

            expect((sut.col1 as Color).code).toBe(green.code);
            expect((sut.col2 as Color).code).toBe(createColor(0, 255, 0).code);
        });
    });

    describe('gradient color interpolation', () => {
        it('returns col2 when rho is 0.0', () => {
            const gc = createInitializedGradient(
                255, 0, 0,  // col1: red
                0, 0, 255,  // col2: blue
                0.0
            );

            // rho=0.0: result = col1*0 + col2*1 = col2
            expect(gc.code).toBe(RGBA_CODE(0, 0, 255, 255));
        });

        it('returns col1 when rho is 1.0', () => {
            const gc = createInitializedGradient(
                255, 0, 0,  // col1: red
                0, 0, 255,  // col2: blue
                1.0
            );

            // rho=1.0: result = col1*1 + col2*0 = col1
            expect(gc.code).toBe(RGBA_CODE(255, 0, 0, 255));
        });

        it('blends colors at rho=0.5', () => {
            const gc = createInitializedGradient(
                200, 100, 0,   // col1
                100, 200, 50,  // col2
                0.5
            );

            const expectedR = expectedGradValue(200, 100, 0.5);
            const expectedG = expectedGradValue(100, 200, 0.5);
            const expectedB = expectedGradValue(0, 50, 0.5);
            const expectedA = expectedGradValue(255, 255, 0.5);

            expect(gc.code).toBe(RGBA_CODE(expectedR, expectedG, expectedB, expectedA));
        });

        it('correctly interpolates each channel independently', () => {
            const gc = createInitializedGradient(
                255, 0, 128,
                0, 255, 64,
                0.3
            );

            const expectedR = expectedGradValue(255, 0, 0.3);
            const expectedG = expectedGradValue(0, 255, 0.3);
            const expectedB = expectedGradValue(128, 64, 0.3);
            const expectedA = expectedGradValue(255, 255, 0.3);

            expect(gc.code).toBe(RGBA_CODE(expectedR, expectedG, expectedB, expectedA));
        });

        it('returns the same value when both colors are identical', () => {
            const gc = createInitializedGradient(
                128, 128, 128,
                128, 128, 128,
                0.7
            );

            // Special case: v1==v2 returns v1 directly
            expect(gc.code).toBe(RGBA_CODE(128, 128, 128, 255));
        });

        it('interpolates alpha channel', () => {
            const gc = createInitializedGradient(
                100, 100, 100,
                100, 100, 100,
                0.5,
                255,  // a1
                0     // a2
            );

            const expectedA = expectedGradValue(255, 0, 0.5);
            expect(gc.code).toBe(RGBA_CODE(100, 100, 100, expectedA));
        });
    });

    describe('gradient with varying rho values', () => {
        const COL1_R = 200, COL1_G = 50, COL1_B = 10;
        const COL2_R = 50, COL2_G = 200, COL2_B = 100;

        it.each([0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0])(
            'produces correct result at rho=%s', (rho) => {
                const gc = createInitializedGradient(
                    COL1_R, COL1_G, COL1_B,
                    COL2_R, COL2_G, COL2_B,
                    rho
                );

                const expectedR = expectedGradValue(COL1_R, COL2_R, rho);
                const expectedG = expectedGradValue(COL1_G, COL2_G, rho);
                const expectedB = expectedGradValue(COL1_B, COL2_B, rho);
                const expectedA = 255; // both colors have alpha=255

                expect(gc.code).toBe(RGBA_CODE(expectedR, expectedG, expectedB, expectedA));
            }
        );
    });

    describe('material', () => {
        it('returns material from col1', () => {
            const c1 = createColor(255, 0, 0);
            c1.material = 'metal';
            const c2 = createColor(0, 0, 255);
            c2.material = 'glass';

            sut.col1 = c1;
            sut.col2 = c2;
            sut.rho = 0.5;

            // GradientColor::material returns m_pColor1->material
            expect(sut.material).toBe('metal');
        });

        it('returns empty material by default from col1', () => {
            sut.col1 = createColor(255, 0, 0);
            sut.col2 = createColor(0, 0, 255);
            sut.rho = 0.5;

            expect(sut.material).toBe('');
        });
    });


    describe('dynamic rho changes', () => {
        it('updates code when rho changes', () => {
            sut.col1 = createColor(255, 0, 0);
            sut.col2 = createColor(0, 0, 255);

            sut.rho = 0.0;
            const code0 = sut.code;

            sut.rho = 1.0;
            const code1 = sut.code;

            expect(code0).toBe(RGBA_CODE(0, 0, 255, 255));
            expect(code1).toBe(RGBA_CODE(255, 0, 0, 255));
            expect(code0).not.toBe(code1);
        });

        it('updates code when col1 changes', () => {
            sut.col1 = createColor(255, 0, 0);
            sut.col2 = createColor(0, 0, 255);
            sut.rho = 1.0;

            const codeBefore = sut.code;

            sut.col1 = createColor(0, 255, 0);
            const codeAfter = sut.code;

            expect(codeBefore).toBe(RGBA_CODE(255, 0, 0, 255));
            expect(codeAfter).toBe(RGBA_CODE(0, 255, 0, 255));
        });
    });

    describe('property introspection', () => {
        it('has rho property', () => {
            expect(sut.hasProp('rho')).toBe(true);
        });

        it('has col1 and col2 properties', () => {
            expect(sut.hasProp('col1')).toBe(true);
            expect(sut.hasProp('col2')).toBe(true);
        });

        it('does not have nonexistent properties', () => {
            expect(sut.hasProp('nonexistent')).toBe(false);
        });

        it('returns valid JSON from getPropsJSON()', () => {
            sut.col1 = createColor(255, 0, 0);
            sut.col2 = createColor(0, 0, 255);
            sut.rho = 0.42;
            const jsonString = sut.getPropsJSON();

            expect(() => JSON.parse(jsonString)).not.toThrow();

            const props = JSON.parse(jsonString);
            expect(Array.isArray(props)).toBe(true);
            expect(props.length).toBeGreaterThan(0);
        });
    });

    describe('edge cases', () => {
        it('throws when accessing color channels without setting colors', () => {
            // GradientColor with null col1/col2 should throw NullPointerException
            expect(() => sut.code).toThrow();
        });

        it('handles black to white gradient', () => {
            const gc = createInitializedGradient(
                0, 0, 0,        // black
                255, 255, 255,  // white
                0.5
            );

            const expected = expectedGradValue(0, 255, 0.5);
            expect(gc.code).toBe(RGBA_CODE(expected, expected, expected, 255));
        });

        it('handles fully transparent to fully opaque gradient', () => {
            const gc = createInitializedGradient(
                128, 128, 128,
                128, 128, 128,
                0.5,
                0,    // fully transparent
                255   // fully opaque
            );

            const expectedA = expectedGradValue(0, 255, 0.5);
            expect(gc.code).toBe(RGBA_CODE(128, 128, 128, expectedA));
        });
    });
});
