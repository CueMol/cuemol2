import { Vector } from '@/wrappers/Vector';
import * as core from '@/async/index';

export const cm = core.createCueMol();

const createVector = async (x: number, y: number, z: number, w: number = 0): Promise<Vector> => {
    const v = await cm.createObj('Vector') as Vector;
    v.set4(x, y, z, w);
    return v;
};

describe('Vector', () => {
    let sut: Vector;

    beforeEach(async () => {
        sut = await cm.createObj('Vector') as Vector;
    });

    describe('initialization and properties', () => {
        it('initializes with zero values by default', async () => {
            expect(await sut.x).toBe(0.0);
            expect(await sut.y).toBe(0.0);
            expect(await sut.z).toBe(0.0);
            expect(await sut.w).toBe(0.0);
        });
        it('handles negative component values', async () => {
            sut.x = 5.5;
            sut.y = -10.0;
            sut.z = 15.25;
            sut.w = -20.5;

            expect(await sut.x).toBe(5.5);
            expect(await sut.y).toBe(-10.0);
            expect(await sut.z).toBe(15.25);
            expect(await sut.w).toBe(-20.5);
        });
    });

    describe('set3() and set4()', () => {
        it('sets 3D vector components with set3(), preserving existing w', async () => {
            await sut.set3(1.0, -2.3, 4.5);

            expect(await sut.x).toBe(1.0);
            expect(await sut.y).toBe(-2.3);
            expect(await sut.z).toBe(4.5);
            // set3() preserves the w component (default is 0)
            expect(await sut.w).toBe(0.0);
        });

        it('sets all 4D vector components with set4()', async () => {
            sut.set4(11.0, -12.3, 14.5, -34.5);

            expect(await sut.x).toBe(11.0);
            expect(await sut.y).toBe(-12.3);
            expect(await sut.z).toBe(14.5);
            expect(await sut.w).toBe(-34.5);
        });

        it('allows overwriting previous values with set3()', async () => {
            sut.set4(1, 2, 3, 4);
            sut.set3(-10, 20, -30);

            expect(await sut.x).toBe(-10);
            expect(await sut.y).toBe(20);
            expect(await sut.z).toBe(-30);
            // Note: set3() does not reset w component - it preserves the previous value
            expect(await sut.w).toBe(4);
        });

    });

    describe('string representation', () => {
        it('returns (0,0,0) for default vector', async () => {
            expect(await sut.strvalue).toBe('(0,0,0)');
            expect(await sut.toString()).toBe('(0,0,0)');
        });

        it('parses vector from string via strvalue setter', async () => {
            sut.strvalue = '(1, 2, 3.14)';

            expect(await sut.strvalue).toBe('(1,2,3.14)');
            expect(await sut.x).toBe(1);
            expect(await sut.y).toBe(2);
            expect(await sut.z).toBe(3.14);
        });

        it('formats vector string without spaces', async () => {
            await sut.set3(1, 2, 3);

            expect(await sut.toString()).toBe('(1,2,3)');
        });

        it('handles 4D vectors in string representation', async () => {
            await sut.set4(1, 2, 3, 4);

            expect(await sut.toString()).toContain('1');
            expect(await sut.toString()).toContain('2');
            expect(await sut.toString()).toContain('3');
        });
    });

});

afterAll(() => {
    cm.terminateWorker();
});
