import { cm } from '../setup';
import type { Color } from '@/wrappers/Color';

// RGBA code layout: (A << 24) | (R << 16) | (G << 8) | B
export const RGBA_CODE = (r: number, g: number, b: number, a: number = 255): number =>
    ((a & 0xFF) << 24 | (r & 0xFF) << 16 | (g & 0xFF) << 8 | (b & 0xFF));

/** Create a Color instance via CueMol factory */
const createColor = (): Color => cm.createObj('Color') as Color;

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
        it('sets and gets float alpha values', () => {
            sut.alpha = 0.5;
            expect(sut.alpha).toBeCloseTo(0.5, 2);

            sut.alpha = 1.0;
            expect(sut.alpha).toBeCloseTo(1.0, 2);

            sut.alpha = 0.0;
            expect(sut.alpha).toBeCloseTo(0.0, 2);
        });

        it('resets to default', () => {
            sut.alpha = 0.3;
            sut.resetProp('alpha');
            expect(sut.alpha).toBeCloseTo(1.0, 2);
        });
    });

    describe('code property', () => {
        it('round-trips codes within signed 32-bit range (A < 128)', () => {
            // A=100 keeps bit 31 clear, avoiding signed overflow
            const code = RGBA_CODE(128, 64, 32, 100);
            sut.code = code;
            expect(sut.code).toBe(code);
        });

        it('stores zero correctly', () => {
            sut.setCode(0);
            expect(sut.code).toBe(0);
        });
    });

    describe('individual channel setters', () => {
        it('each setter updates only its channel', () => {
            sut.setCode(RGBA_CODE(10, 20, 30, 40));

            sut.setR(99);
            expect(sut.code).toBe(RGBA_CODE(99, 20, 30, 40));

            sut.setG(88);
            expect(sut.code).toBe(RGBA_CODE(99, 88, 30, 40));

            sut.setB(77);
            expect(sut.code).toBe(RGBA_CODE(99, 88, 77, 40));

            sut.setA(66);
            expect(sut.code).toBe(RGBA_CODE(99, 88, 77, 66));
        });

        it('masks values to 8-bit range', () => {
            // setCode(0) sets all channels to 0 including A
            sut.setCode(0);
            sut.setR(256); // 256 & 0xFF === 0
            expect(sut.code).toBe(RGBA_CODE(0, 0, 0, 0));

            sut.setG(0x1FF); // 0x1FF & 0xFF === 255
            expect(sut.code).toBe(RGBA_CODE(0, 255, 0, 0));
        });
    });

    describe('setRGBA() / setRGB()', () => {
        it('sets color from normalized floats', () => {
            sut.setRGBA(0.5, 0.5, 0.5, 1.0);
            const code = sut.code;
            expect((code >> 16) & 0xFF).toBe(128);
            expect((code >> 8) & 0xFF).toBe(128);
            expect(code & 0xFF).toBe(128);
        });

        it('clamps values to [0.0, 1.0]', () => {
            sut.setRGBA(2.0, -1.0, 0.5, 1.0);
            const code = sut.code;
            expect((code >> 16) & 0xFF).toBe(255); // clamped to 1.0
            expect((code >> 8) & 0xFF).toBe(0);    // clamped to 0.0
            expect(code & 0xFF).toBe(128);
        });

        it('setRGB is an alias for setRGBA with alpha=1.0', () => {
            sut.setRGB(0.0, 1.0, 0.0);
            const code = sut.code;
            expect((code >> 8) & 0xFF).toBe(255);   // G=255
            expect((code >>> 24) & 0xFF).toBe(255);  // A=255
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
            const code = sut.code;
            expect((code >> 16) & 0xFF).toBe(expR);
            expect((code >> 8) & 0xFF).toBe(expG);
            expect(code & 0xFF).toBe(expB);
        });

        it('setHSB is an alias for setHSBA with alpha=1.0', () => {
            sut.setHSB(0.0, 1.0, 1.0);
            expect((sut.code >>> 24) & 0xFF).toBe(255);
        });
    });

    describe('toString()', () => {
        it('returns #RRGGBB hex for opaque RGB colors', () => {
            sut.setRGBA(1.0, 0.0, 0.0, 1.0);
            expect(sut.toString()).toBe('#FF0000');

            sut.setRGBA(1.0, 1.0, 1.0, 1.0);
            expect(sut.toString()).toBe('#FFFFFF');
        });

        it('returns rgba() format when alpha < 255', () => {
            sut.setRGBA(1.0, 0.0, 0.0, 0.5);
            expect(sut.toString()).toMatch(/^rgba\(/);
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
