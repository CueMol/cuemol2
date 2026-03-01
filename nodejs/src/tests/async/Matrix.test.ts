import * as core from '@/async/index';
import { Vector } from '@/wrappers/Vector';
import { Matrix } from '@/wrappers/Matrix';

export const cm = core.createCueMol();

const DEFAULT_DIAG_VALUES = {
    a: 10.2,
    b: 100.1,
    c: 1111.3,
    d: 1234.5,
} as const;

const TOLERANCE = 1e-6;

const vec = async (x: number, y: number, z: number, w?: number): Promise<Vector> => {
    const v = await cm.createObj('Vector') as Vector;
    w !== undefined ? await v.set4(x, y, z, w) : await v.set3(x, y, z);
    return v;
};

const diagMatrix = async (
    a: number = DEFAULT_DIAG_VALUES.a,
    b: number = DEFAULT_DIAG_VALUES.b,
    c: number = DEFAULT_DIAG_VALUES.c,
    d: number = DEFAULT_DIAG_VALUES.d
): Promise<Matrix> => {
    const m = await cm.createObj('Matrix') as Matrix;
    await m.setAt(1, 1, a);
    await m.setAt(2, 2, b);
    await m.setAt(3, 3, c);
    await m.setAt(4, 4, d);
    return m;
};

const expectOffDiagonalZero = async (m: Matrix): Promise<void> => {
    for (let i = 1; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) {
            if (i !== j) {
                expect(await m.getAt(i, j)).toBeCloseTo(0);
            }
        }
    }
};

const expectIdentity = async (m: Matrix): Promise<void> => {
    for (let i = 1; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) {
            expect(await m.getAt(i, j)).toBeCloseTo(i === j ? 1 : 0);
        }
    }
};

const expectAllZero = async (m: Matrix): Promise<void> => {
    for (let i = 1; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) {
            expect(await m.getAt(i, j)).toBe(0);
        }
    }
};

const expectDiagonal = async (
    m: Matrix,
    expected: [number, number, number, number]
): Promise<void> => {
    expect(await m.getAt(1, 1)).toBeCloseTo(expected[0], TOLERANCE);
    expect(await m.getAt(2, 2)).toBeCloseTo(expected[1], TOLERANCE);
    expect(await m.getAt(3, 3)).toBeCloseTo(expected[2], TOLERANCE);
    expect(await m.getAt(4, 4)).toBeCloseTo(expected[3], TOLERANCE);
};

describe('Matrix', () => {
    let mat: Matrix;

    beforeEach(async () => {
        mat = await cm.createObj('Matrix') as Matrix;
    });

    describe('element access', () => {
        it('sets and gets diagonal elements', async () => {
            const { a, b, c, d } = DEFAULT_DIAG_VALUES;
            mat.setAt(1, 1, a);
            mat.setAt(2, 2, b);
            mat.setAt(3, 3, c);
            mat.setAt(4, 4, d);

            expect(await mat.getAt(1, 1)).toBe(a);
            expect(await mat.getAt(2, 2)).toBe(b);
            expect(await mat.getAt(3, 3)).toBe(c);
            expect(await mat.getAt(4, 4)).toBe(d);
        });

        it('sets and gets off-diagonal elements', async () => {
            const value1 = 42.0;
            const value2 = 99.9;

            mat.setAt(1, 3, value1);
            mat.setAt(3, 1, value2);

            expect(await mat.getAt(1, 3)).toBe(value1);
            expect(await mat.getAt(3, 1)).toBe(value2);
        });

        it.each([
            // ['setAt with row out of range', (m: Matrix) => m.setAt(100, 1, 0)],
            // ['setAt with col out of range', (m: Matrix) => m.setAt(1, 100, 0)],
            // ['setAt with zero row index', (m: Matrix) => m.setAt(0, 1, 0)],
            // ['setAt with zero col index', (m: Matrix) => m.setAt(1, 0, 0)],
            // ['setAt with negative row index', (m: Matrix) => m.setAt(-1, 1, 0)],
            // ['setAt with negative col index', (m: Matrix) => m.setAt(1, -1, 0)],
            ['getAt with row out of range', async (m: Matrix) => m.getAt(100, 1)],
            ['getAt with col out of range', async (m: Matrix) => m.getAt(1, 100)],
            ['getAt with zero row index', async (m: Matrix) => m.getAt(0, 1)],
            ['getAt with zero col index', async (m: Matrix) => m.getAt(1, 0)],
            // ['addAt with row out of range', (m: Matrix) => m.addAt(100, 1, 0)],
            // ['addAt with col out of range', (m: Matrix) => m.addAt(1, 100, 0)],
        ])('%s throws exception', async (_name: string, fn: (m: Matrix) => Promise<any>) => {
            const res = fn(mat);
            console.log('Got result from fn:', res);
            res.then(() => {}).catch((e: any) => {
                console.log('Caught error as expected:', e);
            });
            await expect(res).rejects.toThrow();
            // expect(() => fn(mat)).toThrow();
        });

        it('addAt accumulates onto existing value', async () => {
            const value1 = 10.2;
            const value2 = 100.1;

            mat.addAt(1, 1, value1);
            mat.addAt(2, 2, value2);

            // Default identity has 1 on diagonal
            expect(await mat.getAt(1, 1)).toBe(1 + value1);
            expect(await mat.getAt(2, 2)).toBe(1 + value2);
        });

        it('addAt on zero matrix accumulates correctly', async () => {
            mat.setZero();
            const value = 42.5;

            mat.addAt(2, 3, value);
            mat.addAt(2, 3, value);

            expect(await mat.getAt(2, 3)).toBe(value * 2);
        });
    });
});

afterAll(() => {
    cm.terminateWorker();
});
