import type { Color } from '@/wrappers/Color';
import { RGBA_CODE, createColor } from './test-helpers';

describe('Color (SolidColor)', () => {
    let sut: Color;

    beforeEach(() => {
        sut = createColor();
    });

    describe('initialization', () => {
        it('initializes with code 0, alpha 0, and empty material', () => {
            // C++ constructor sets m_code=0, so all channels including alpha are 0
            expect(sut.code).toBe(0);
            expect(sut.alpha).toBe(0);
            expect(sut.material).toBe('');
        });
    });

    describe('material property', () => {
        it('sets, gets, and resets to default', () => {
            sut.material = 'glass';
            expect(sut.material).toBe('glass');

            sut.resetProp('material');
            expect(sut.material).toBe('');
        });
    });

    describe('alpha property', () => {
        it('sets, gets, and resets float alpha values', () => {
            sut.alpha = 0.5;
            expect(sut.alpha).toBeCloseTo(0.5, 2);

            sut.alpha = 0.0;
            expect(sut.alpha).toBeCloseTo(0.0, 2);

            sut.alpha = 0.3;
            sut.resetProp('alpha');
            expect(sut.alpha).toBeCloseTo(1.0, 2);
        });
    });

    describe('code property', () => {
        it('round-trips RGBA codes with alpha < 0x80 (128)', () => {
            const code = RGBA_CODE(128, 64, 32, 100);
            sut.code = code;
            expect(sut.code).toBe(code);
        });

        it('round-trips RGBA codes with alpha >= 0x80 (128)', () => {
            // Test alpha values above 128 to ensure proper handling of unsigned 32-bit values
            const testCases = [
                { r: 255, g: 128, b: 64, a: 128 },  // alpha = 0x80
                { r: 100, g: 200, b: 50, a: 200 },  // alpha = 0xC8
                { r: 255, g: 255, b: 255, a: 255 }, // alpha = 0xFF (fully opaque)
            ];

            testCases.forEach(({ r, g, b, a }) => {
                const code = RGBA_CODE(r, g, b, a);
                sut.code = code;

                expect(sut.code).toBe(code);
                // Verify using AbstractColor methods
                expect(sut.r()).toBe(r);
                expect(sut.g()).toBe(g);
                expect(sut.b()).toBe(b);
                expect(sut.a()).toBe(a);
            });
        });

        it('stores zero correctly', () => {
            sut.setCode(0);
            expect(sut.code).toBe(0);
        });

        it('correctly extracts RGBA components using AbstractColor methods', () => {
            // Verify that r(), g(), b(), a() methods work correctly with alpha >= 128
            sut.code = RGBA_CODE(255, 128, 64, 200);

            expect(sut.a()).toBe(200);
            expect(sut.r()).toBe(255);
            expect(sut.g()).toBe(128);
            expect(sut.b()).toBe(64);
        });

        it('provides float accessors via fr(), fg(), fb(), fa()', () => {
            sut.code = RGBA_CODE(255, 128, 64, 200);

            // fr(), fg(), fb(), fa() return values in [0.0, 1.0] range
            expect(sut.fr()).toBeCloseTo(1.0, 2);      // 255/255
            expect(sut.fg()).toBeCloseTo(0.502, 2);    // 128/255
            expect(sut.fb()).toBeCloseTo(0.251, 2);    // 64/255
            expect(sut.fa()).toBeCloseTo(0.784, 2);    // 200/255
        });
    });

    describe('individual channel setters', () => {
        it('each setter updates only its channel', () => {
            sut.setCode(RGBA_CODE(10, 20, 30, 40));

            sut.setR(99);
            expect(sut.r()).toBe(99);
            expect(sut.g()).toBe(20);
            expect(sut.b()).toBe(30);
            expect(sut.a()).toBe(40);

            sut.setG(88);
            expect(sut.r()).toBe(99);
            expect(sut.g()).toBe(88);
            expect(sut.b()).toBe(30);
            expect(sut.a()).toBe(40);

            sut.setB(77);
            expect(sut.r()).toBe(99);
            expect(sut.g()).toBe(88);
            expect(sut.b()).toBe(77);
            expect(sut.a()).toBe(40);

            sut.setA(66);
            expect(sut.r()).toBe(99);
            expect(sut.g()).toBe(88);
            expect(sut.b()).toBe(77);
            expect(sut.a()).toBe(66);
        });

        it('setA works correctly with values >= 128', () => {
            sut.setCode(RGBA_CODE(100, 100, 100, 50));

            sut.setA(200);
            expect(sut.a()).toBe(200);
            expect(sut.fa()).toBeCloseTo(0.784, 2); // 200/255

            sut.setA(255);
            expect(sut.a()).toBe(255);
            expect(sut.fa()).toBeCloseTo(1.0, 2);
        });

        it('masks values to 8-bit range', () => {
            sut.setCode(0);

            sut.setR(256); // 256 & 0xFF === 0
            expect(sut.r()).toBe(0);
            expect(sut.code).toBe(RGBA_CODE(0, 0, 0, 0));

            sut.setG(0x1FF); // 0x1FF & 0xFF === 255
            expect(sut.g()).toBe(255);
            expect(sut.code).toBe(RGBA_CODE(0, 255, 0, 0));
        });
    });

    describe('setRGBA() / setRGB()', () => {
        it('sets color from normalized floats', () => {
            sut.setRGBA(0.5, 0.5, 0.5, 1.0);

            expect(sut.r()).toBe(128);
            expect(sut.g()).toBe(128);
            expect(sut.b()).toBe(128);
            expect(sut.a()).toBe(255);

            // Verify float accessors return correct values
            expect(sut.fr()).toBeCloseTo(0.5, 2);
            expect(sut.fg()).toBeCloseTo(0.5, 2);
            expect(sut.fb()).toBeCloseTo(0.5, 2);
            expect(sut.fa()).toBeCloseTo(1.0, 2);
        });

        it('clamps values to [0.0, 1.0]', () => {
            sut.setRGBA(2.0, -1.0, 0.5, 1.0);

            expect(sut.r()).toBe(255); // clamped to 1.0
            expect(sut.g()).toBe(0);   // clamped to 0.0
            expect(sut.b()).toBe(128);
            expect(sut.a()).toBe(255);
        });

        it('handles partial alpha values correctly', () => {
            // Test alpha values that map to >= 128 when converted to byte range
            sut.setRGBA(1.0, 0.0, 0.0, 0.6);  // 0.6 * 255 ≈ 153

            expect(sut.a()).toBeCloseTo(153, 0);
            expect(sut.r()).toBe(255);
            expect(sut.fa()).toBeCloseTo(0.6, 2);
            expect(sut.fr()).toBeCloseTo(1.0, 2);
        });

        it('handles alpha >= 0.5 (maps to >= 128)', () => {
            const testCases = [
                { alpha: 0.5, expected: 128 },   // 0.5 * 255 ≈ 128
                { alpha: 0.75, expected: 191 },  // 0.75 * 255 ≈ 191
                { alpha: 1.0, expected: 255 },   // 1.0 * 255 = 255
            ];

            testCases.forEach(({ alpha, expected }) => {
                sut.setRGBA(0.5, 0.5, 0.5, alpha);
                expect(sut.a()).toBeCloseTo(expected, 0);
                expect(sut.fa()).toBeCloseTo(alpha, 2);
            });
        });

        it('setRGB is an alias for setRGBA with alpha=1.0', () => {
            sut.setRGB(0.0, 1.0, 0.0);

            expect(sut.r()).toBe(0);
            expect(sut.g()).toBe(255);
            expect(sut.b()).toBe(0);
            expect(sut.a()).toBe(255);

            expect(sut.fg()).toBeCloseTo(1.0, 2);
            expect(sut.fa()).toBeCloseTo(1.0, 2);
        });
    });

    describe('setHSBA() / setHSB()', () => {
        it.each([
            ['red', 0.0, 255, 0, 0],
            ['green', 1.0 / 3.0, 0, 255, 0],
            ['blue', 2.0 / 3.0, 0, 0, 255],
            ['white (sat=0)', -1, 255, 255, 255],  // sentinel: sat=0, bri=1
        ])('converts %s correctly', (_name, hue, expR, expG, expB) => {
            if (hue === -1) {
                sut.setHSBA(0.0, 0.0, 1.0, 1.0); // white
            } else {
                sut.setHSBA(hue, 1.0, 1.0, 1.0);
            }

            expect(sut.r()).toBe(expR);
            expect(sut.g()).toBe(expG);
            expect(sut.b()).toBe(expB);
            expect(sut.a()).toBe(255);
        });

        it('setHSB is an alias for setHSBA with alpha=1.0', () => {
            sut.setHSB(0.0, 1.0, 1.0);
            expect(sut.a()).toBe(255);
            expect(sut.fa()).toBeCloseTo(1.0, 2);
        });

        it('handles HSB with partial alpha', () => {
            sut.setHSBA(0.0, 1.0, 1.0, 0.75);  // red with 75% alpha

            expect(sut.r()).toBe(255);
            expect(sut.g()).toBe(0);
            expect(sut.b()).toBe(0);
            expect(sut.a()).toBeCloseTo(191, 0); // 0.75 * 255 ≈ 191
            expect(sut.fa()).toBeCloseTo(0.75, 2);
        });
    });

    describe('AbstractColor float accessors (fr, fg, fb, fa)', () => {
        it('returns float values in [0.0, 1.0] range', () => {
            sut.code = RGBA_CODE(255, 128, 64, 200);

            expect(sut.fr()).toBeGreaterThanOrEqual(0.0);
            expect(sut.fr()).toBeLessThanOrEqual(1.0);
            expect(sut.fg()).toBeGreaterThanOrEqual(0.0);
            expect(sut.fg()).toBeLessThanOrEqual(1.0);
            expect(sut.fb()).toBeGreaterThanOrEqual(0.0);
            expect(sut.fb()).toBeLessThanOrEqual(1.0);
            expect(sut.fa()).toBeGreaterThanOrEqual(0.0);
            expect(sut.fa()).toBeLessThanOrEqual(1.0);
        });

        it('correctly converts integer to float values', () => {
            const testCases = [
                { r: 0, g: 0, b: 0, a: 0, fr: 0.0, fg: 0.0, fb: 0.0, fa: 0.0 },
                { r: 128, g: 128, b: 128, a: 128, fr: 0.502, fg: 0.502, fb: 0.502, fa: 0.502 },
                { r: 255, g: 255, b: 255, a: 255, fr: 1.0, fg: 1.0, fb: 1.0, fa: 1.0 },
                { r: 255, g: 0, b: 128, a: 200, fr: 1.0, fg: 0.0, fb: 0.502, fa: 0.784 },
            ];

            testCases.forEach(({ r, g, b, a, fr, fg, fb, fa }) => {
                sut.code = RGBA_CODE(r, g, b, a);

                expect(sut.fr()).toBeCloseTo(fr, 2);
                expect(sut.fg()).toBeCloseTo(fg, 2);
                expect(sut.fb()).toBeCloseTo(fb, 2);
                expect(sut.fa()).toBeCloseTo(fa, 2);
            });
        });

        it('matches alpha property for full opacity', () => {
            sut.setRGBA(0.5, 0.5, 0.5, 1.0);

            expect(sut.alpha).toBeCloseTo(1.0, 2);
            expect(sut.fa()).toBeCloseTo(1.0, 2);
        });

        it('handles high alpha values (>= 128) correctly', () => {
            const testCases = [
                { a: 128, expected: 0.502 },   // 128/255
                { a: 191, expected: 0.749 },   // 191/255
                { a: 200, expected: 0.784 },   // 200/255
                { a: 255, expected: 1.0 },     // 255/255
            ];

            testCases.forEach(({ a, expected }) => {
                sut.setA(a);
                expect(sut.fa()).toBeCloseTo(expected, 2);
            });
        });
    });

    describe('AbstractColor integer accessors (r, g, b, a)', () => {
        it('returns integer values in [0, 255] range', () => {
            sut.code = RGBA_CODE(255, 128, 64, 200);

            expect(sut.r()).toBeGreaterThanOrEqual(0);
            expect(sut.r()).toBeLessThanOrEqual(255);
            expect(sut.g()).toBeGreaterThanOrEqual(0);
            expect(sut.g()).toBeLessThanOrEqual(255);
            expect(sut.b()).toBeGreaterThanOrEqual(0);
            expect(sut.b()).toBeLessThanOrEqual(255);
            expect(sut.a()).toBeGreaterThanOrEqual(0);
            expect(sut.a()).toBeLessThanOrEqual(255);
        });

        it('matches setR/setG/setB/setA behavior', () => {
            sut.setR(100);
            expect(sut.r()).toBe(100);

            sut.setG(150);
            expect(sut.g()).toBe(150);

            sut.setB(200);
            expect(sut.b()).toBe(200);

            sut.setA(175);
            expect(sut.a()).toBe(175);
        });

        it('handles boundary values correctly', () => {
            sut.code = RGBA_CODE(0, 128, 255, 200);

            expect(sut.r()).toBe(0);
            expect(sut.g()).toBe(128);
            expect(sut.b()).toBe(255);
            expect(sut.a()).toBe(200);
        });
    });

    describe('toString()', () => {
        it('returns #RRGGBB hex for opaque RGB colors', () => {
            sut.setRGBA(1.0, 0.0, 0.0, 1.0);
            expect(sut.toString()).toBe('#FF0000');
            expect(sut.a()).toBe(255);

            sut.setRGBA(1.0, 1.0, 1.0, 1.0);
            expect(sut.toString()).toBe('#FFFFFF');
            expect(sut.a()).toBe(255);
        });

        it('returns rgba() format when alpha < 255', () => {
            sut.setRGBA(1.0, 0.0, 0.0, 0.5);
            expect(sut.toString()).toMatch(/^rgba\(/);
            expect(sut.a()).toBeCloseTo(128, 0);
            expect(sut.fa()).toBeCloseTo(0.5, 2);
        });

        it('returns rgba() format for high alpha values < 255', () => {
            // Test with alpha >= 128 but < 255
            sut.setRGBA(0.5, 0.5, 0.5, 0.75);  // alpha ≈ 191
            const str = sut.toString();

            expect(str).toMatch(/^rgba\(/);
            expect(sut.a()).toBeCloseTo(191, 0);
        });
    });

    describe('property introspection', () => {
        it('reports correct property existence', () => {
            expect(sut.hasProp('material')).toBe(true);
            expect(sut.hasProp('alpha')).toBe(true);
            expect(sut.hasProp('code')).toBe(true);
            expect(sut.hasProp('nonexistent')).toBe(false);
        });

        it('returns valid JSON from getPropsJSON()', () => {
            const props = JSON.parse(sut.getPropsJSON());
            expect(Array.isArray(props)).toBe(true);
            expect(props.length).toBeGreaterThan(0);
        });
    });
});
