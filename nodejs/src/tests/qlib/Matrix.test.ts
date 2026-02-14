import { cm } from '../setup';
import { Vector } from '@/wrappers/Vector';
import { Matrix } from '@/wrappers/Matrix';

/**
 * Type definitions for CueMol objects
 */

/**
 * Constants for test data
 */
const DEFAULT_DIAG_VALUES = {
    a: 10.2,
    b: 100.1,
    c: 1111.3,
    d: 1234.5,
} as const;

const TOLERANCE = 1e-6;

/**
 * Create a Vector with 3 or 4 components
 */
const vec = (x: number, y: number, z: number, w?: number): Vector => {
    const v = cm.createObj('Vector') as Vector;
    w !== undefined ? v.set4(x, y, z, w) : v.set3(x, y, z);
    return v;
};

/**
 * Create a diagonal matrix with given values
 */
const diagMatrix = (
    a: number = DEFAULT_DIAG_VALUES.a,
    b: number = DEFAULT_DIAG_VALUES.b,
    c: number = DEFAULT_DIAG_VALUES.c,
    d: number = DEFAULT_DIAG_VALUES.d
): Matrix => {
    const m = cm.createObj('Matrix') as Matrix;
    m.setAt(1, 1, a);
    m.setAt(2, 2, b);
    m.setAt(3, 3, c);
    m.setAt(4, 4, d);
    return m;
};

/**
 * Assert all off-diagonal elements are zero
 */
const expectOffDiagonalZero = (m: Matrix): void => {
    for (let i = 1; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) {
            if (i !== j) {
                expect(m.getAt(i, j)).toBeCloseTo(0);
            }
        }
    }
};

/**
 * Assert matrix is identity
 */
const expectIdentity = (m: Matrix): void => {
    for (let i = 1; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) {
            expect(m.getAt(i, j)).toBeCloseTo(i === j ? 1 : 0);
        }
    }
};

/**
 * Assert matrix is all zeros
 */
const expectAllZero = (m: Matrix): void => {
    for (let i = 1; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) {
            expect(m.getAt(i, j)).toBe(0);
        }
    }
};

/**
 * Assert diagonal elements match expected values
 */
const expectDiagonal = (
    m: Matrix,
    expected: [number, number, number, number]
): void => {
    expect(m.getAt(1, 1)).toBeCloseTo(expected[0], TOLERANCE);
    expect(m.getAt(2, 2)).toBeCloseTo(expected[1], TOLERANCE);
    expect(m.getAt(3, 3)).toBeCloseTo(expected[2], TOLERANCE);
    expect(m.getAt(4, 4)).toBeCloseTo(expected[3], TOLERANCE);
};

describe('Matrix', () => {
    let mat: Matrix;

    beforeEach(() => {
        mat = cm.createObj('Matrix') as Matrix;
    });

    describe('element access', () => {
        it('sets and gets diagonal elements', () => {
            const { a, b, c, d } = DEFAULT_DIAG_VALUES;
            mat.setAt(1, 1, a);
            mat.setAt(2, 2, b);
            mat.setAt(3, 3, c);
            mat.setAt(4, 4, d);

            expect(mat.getAt(1, 1)).toBe(a);
            expect(mat.getAt(2, 2)).toBe(b);
            expect(mat.getAt(3, 3)).toBe(c);
            expect(mat.getAt(4, 4)).toBe(d);
        });

        it('sets and gets off-diagonal elements', () => {
            const value1 = 42.0;
            const value2 = 99.9;

            mat.setAt(1, 3, value1);
            mat.setAt(3, 1, value2);

            expect(mat.getAt(1, 3)).toBe(value1);
            expect(mat.getAt(3, 1)).toBe(value2);
        });

        it.each([
            ['setAt with row out of range', (m: Matrix) => m.setAt(100, 1, 0)],
            ['setAt with col out of range', (m: Matrix) => m.setAt(1, 100, 0)],
            ['setAt with zero row index', (m: Matrix) => m.setAt(0, 1, 0)],
            ['setAt with zero col index', (m: Matrix) => m.setAt(1, 0, 0)],
            ['setAt with negative row index', (m: Matrix) => m.setAt(-1, 1, 0)],
            ['setAt with negative col index', (m: Matrix) => m.setAt(1, -1, 0)],
            ['getAt with row out of range', (m: Matrix) => m.getAt(100, 1)],
            ['getAt with col out of range', (m: Matrix) => m.getAt(1, 100)],
            ['getAt with zero row index', (m: Matrix) => m.getAt(0, 1)],
            ['getAt with zero col index', (m: Matrix) => m.getAt(1, 0)],
            ['addAt with row out of range', (m: Matrix) => m.addAt(100, 1, 0)],
            ['addAt with col out of range', (m: Matrix) => m.addAt(1, 100, 0)],
        ])('%s throws exception', (_name: string, fn: (m: Matrix) => void) => {
            expect(() => fn(mat)).toThrow();
        });

        it('addAt accumulates onto existing value', () => {
            const value1 = 10.2;
            const value2 = 100.1;

            mat.addAt(1, 1, value1);
            mat.addAt(2, 2, value2);

            // Default identity has 1 on diagonal
            expect(mat.getAt(1, 1)).toBe(1 + value1);
            expect(mat.getAt(2, 2)).toBe(1 + value2);
        });

        it('addAt on zero matrix accumulates correctly', () => {
            mat.setZero();
            const value = 42.5;

            mat.addAt(2, 3, value);
            mat.addAt(2, 3, value);

            expect(mat.getAt(2, 3)).toBe(value * 2);
        });
    });

    describe('initialization and state', () => {
        it('starts as identity matrix', () => {
            expect(mat.isIdent()).toBe(true);
            expectIdentity(mat);
        });

        it('setIdent resets to identity', () => {
            const m = diagMatrix();
            m.setIdent();
            expectIdentity(m);
        });

        it('setZero clears all elements', () => {
            const m = diagMatrix();
            m.setZero();
            expectAllZero(m);
        });

        it('isZero returns correct state', () => {
            expect(mat.isZero()).toBe(false);
            mat.setZero();
            expect(mat.isZero()).toBe(true);
        });

        it('isIdent returns false after modification', () => {
            mat.setAt(1, 2, 5.0);
            expect(mat.isIdent()).toBe(false);
        });

        it('isIdent returns false for zero matrix', () => {
            mat.setZero();
            expect(mat.isIdent()).toBe(false);
        });

        it('isZero returns false for identity matrix', () => {
            expect(mat.isZero()).toBe(false);
        });
    });

    describe('toString and equals', () => {
        it('serializes to formatted string', () => {
            const m = diagMatrix();
            expect(m.toString()).toBe(
                '(10.2000000,0.0000000,0.0000000,0.0000000,' +
                '0.0000000,100.1000000,0.0000000,0.0000000,' +
                '0.0000000,0.0000000,1111.3000000,0.0000000,' +
                '0.0000000,0.0000000,0.0000000,1234.5000000)'
            );
        });

        it('equals returns true for identical matrices', () => {
            const m1 = diagMatrix();
            const m2 = diagMatrix();
            expect(m1.equals(m2)).toBe(true);
        });

        it('equals returns false for different matrices', () => {
            const m1 = diagMatrix();
            const m2 = diagMatrix(1, 2, 3, 4);
            expect(m1.equals(m2)).toBe(false);
        });

        it('equals returns true for identity matrices', () => {
            const m1 = cm.createObj('Matrix') as Matrix;
            const m2 = cm.createObj('Matrix') as Matrix;
            expect(m1.equals(m2)).toBe(true);
        });

        it('equals returns false for identity vs modified matrix', () => {
            const m1 = cm.createObj('Matrix') as Matrix;
            const m2 = cm.createObj('Matrix') as Matrix;
            m2.setAt(1, 1, 2.0);
            expect(m1.equals(m2)).toBe(false);
        });
    });

    describe('scalar arithmetic', () => {
        const { a, b, c, d } = DEFAULT_DIAG_VALUES;

        it('scale multiplies all elements', () => {
            const m = diagMatrix();
            const scaleFactor = 2.0;
            const r = m.scale(scaleFactor);

            expectDiagonal(r, [a * scaleFactor, b * scaleFactor, c * scaleFactor, d * scaleFactor]);
            expectOffDiagonalZero(r);
        });

        it('divide divides all elements', () => {
            const m = diagMatrix();
            const divisor = 2.0;
            const r = m.divide(divisor);

            expectDiagonal(r, [a / divisor, b / divisor, c / divisor, d / divisor]);
            expectOffDiagonalZero(r);
        });

        it.each([
            ['scale', 1, (m: Matrix) => m.scale(1)],
            ['divide', 1, (m: Matrix) => m.divide(1)],
        ])(
            '%s by %d preserves the matrix',
            (_name: string, _factor: number, operation: (m: Matrix) => Matrix) => {
                const m = diagMatrix();
                const r = operation(m);
                expect(m.equals(r)).toBe(true);
            }
        );

        it('scale by zero produces zero matrix', () => {
            const m = diagMatrix();
            const r = m.scale(0);
            expectAllZero(r);
        });

        it('scale by negative number negates all elements', () => {
            const m = diagMatrix();
            const scaleFactor = -1.0;
            const r = m.scale(scaleFactor);

            expectDiagonal(r, [-a, -b, -c, -d]);
            expectOffDiagonalZero(r);
        });

        it('divide preserves off-diagonal zeros', () => {
            const m = diagMatrix();
            const r = m.divide(2.0);
            expectOffDiagonalZero(r);
        });
    });

    describe('matrix arithmetic', () => {
        it('add combines corresponding elements', () => {
            const a = diagMatrix();
            const b = diagMatrix(1, 2, 3, 4);
            const r = a.add(b);

            const { a: v1, b: v2, c: v3, d: v4 } = DEFAULT_DIAG_VALUES;
            expectDiagonal(r, [v1 + 1, v2 + 2, v3 + 3, v4 + 4]);
            expectOffDiagonalZero(r);
        });

        it('sub computes element-wise difference', () => {
            const a = diagMatrix();
            const b = diagMatrix(1, 2, 3, 4);
            const r = a.sub(b);

            const { a: v1, b: v2, c: v3, d: v4 } = DEFAULT_DIAG_VALUES;
            expectDiagonal(r, [v1 - 1, v2 - 2, v3 - 3, v4 - 4]);
            expectOffDiagonalZero(r);
        });

        it('add with zero matrix preserves original', () => {
            const a = diagMatrix();
            const zero = cm.createObj('Matrix') as Matrix;
            zero.setZero();
            const r = a.add(zero);

            expect(a.equals(r)).toBe(true);
        });

        it('sub with itself produces zero matrix', () => {
            const a = diagMatrix();
            const r = a.sub(a);
            expectAllZero(r);
        });

        it('mul with identity preserves matrix', () => {
            const a = diagMatrix();
            const identity = cm.createObj('Matrix') as Matrix;
            const r = a.mul(identity);

            expect(a.equals(r)).toBe(true);
        });

        it('mul is not commutative', () => {
            const a = cm.createObj('Matrix') as Matrix;
            a.setAt(1, 2, 1.0);

            const b = cm.createObj('Matrix') as Matrix;
            b.setAt(2, 1, 1.0);

            const ab = a.mul(b);
            const ba = b.mul(a);
            expect(ab.equals(ba)).toBe(false);
        });

        it('mul with zero matrix produces zero matrix', () => {
            const a = diagMatrix();
            const zero = cm.createObj('Matrix') as Matrix;
            zero.setZero();
            const r = a.mul(zero);

            expectAllZero(r);
        });

        it('mul diagonal matrices produces diagonal result', () => {
            const a = diagMatrix(2, 3, 4, 5);
            const b = diagMatrix(6, 7, 8, 9);
            const r = a.mul(b);

            expectDiagonal(r, [2 * 6, 3 * 7, 4 * 8, 5 * 9]);
            expectOffDiagonalZero(r);
        });
    });

    describe('matrix-vector multiplication', () => {
        it('mulvec transforms vector by matrix', () => {
            const m = diagMatrix();
            const v = m.mulvec(vec(1, 2, 3, 4));

            const { a, b, c, d } = DEFAULT_DIAG_VALUES;
            expect(v.x).toBeCloseTo(a * 1);
            expect(v.y).toBeCloseTo(b * 2);
            expect(v.z).toBeCloseTo(c * 3);
            expect(v.w).toBeCloseTo(d * 4);
        });

        it('identity mulvec preserves vector', () => {
            const v = mat.mulvec(vec(1, 2, 3, 4));

            expect(v.x).toBe(1);
            expect(v.y).toBe(2);
            expect(v.z).toBe(3);
            expect(v.w).toBe(4);
        });

        it('zero matrix mulvec produces zero vector', () => {
            mat.setZero();
            const v = mat.mulvec(vec(1, 2, 3, 4));

            expect(v.x).toBe(0);
            expect(v.y).toBe(0);
            expect(v.z).toBe(0);
            expect(v.w).toBe(0);
        });

        it('mulvec with zero vector produces zero vector', () => {
            const m = diagMatrix();
            const v = m.mulvec(vec(0, 0, 0, 0));

            expect(v.x).toBe(0);
            expect(v.y).toBe(0);
            expect(v.z).toBe(0);
            expect(v.w).toBe(0);
        });
    });

    describe('transforms', () => {
        const DEGREES_60 = 60.0;
        const ROTATION_CENTER = vec(1, 1, 1);
        const ROTATION_AXIS = vec(1, 1, 1);

        it('setRotate produces correct rotation matrix', () => {
            const cen = ROTATION_CENTER;
            const ax = ROTATION_AXIS.normalize();
            mat.setRotate(cen, ax, DEGREES_60);

            // Expected: 60-degree rotation around (1,1,1) axis
            const expected = [
                [0.6666667, 0.6666667, -0.3333333, 0],
                [-0.3333333, 0.6666667, 0.6666667, 0],
                [0.6666667, -0.3333333, 0.6666667, 0],
                [0, 0, 0, 1],
            ];

            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    expect(mat.getAt(i + 1, j + 1)).toBeCloseTo(expected[i][j]);
                }
            }
        });

        it('setRotate with zero angle produces identity', () => {
            const cen = ROTATION_CENTER;
            const ax = ROTATION_AXIS.normalize();
            mat.setRotate(cen, ax, 0);

            expectIdentity(mat);
        });

        it('setTranslate produces correct translation matrix', () => {
            mat.setTranslate(vec(1, 1, 1));

            for (let i = 1; i <= 4; i++) {
                for (let j = 1; j <= 4; j++) {
                    if (i === j) {
                        expect(mat.getAt(i, j)).toBe(1);
                    } else if (j === 4) {
                        expect(mat.getAt(i, j)).toBe(1);
                    } else {
                        expect(mat.getAt(i, j)).toBe(0);
                    }
                }
            }
        });

        it('setTranslate with zero vector produces identity', () => {
            mat.setTranslate(vec(0, 0, 0));
            expectIdentity(mat);
        });

        it('setTranslate with negative values translates correctly', () => {
            mat.setTranslate(vec(-5, -10, -15));

            // Check translation column (column 4)
            expect(mat.getAt(1, 4)).toBe(-5);
            expect(mat.getAt(2, 4)).toBe(-10);
            expect(mat.getAt(3, 4)).toBe(-15);

            // Check that rotation part is identity
            for (let i = 1; i <= 3; i++) {
                for (let j = 1; j <= 3; j++) {
                    expect(mat.getAt(i, j)).toBe(i === j ? 1 : 0);
                }
            }
        });
    });

    describe('diag3', () => {
        it('performs eigenvalue decomposition of 3x3 block', () => {
            const m = diagMatrix();
            const r = m.diag3();

            // For a diagonal matrix, eigenvectors form the identity matrix
            expect(r.getAt(1, 1)).toBeCloseTo(1);
            expect(r.getAt(2, 2)).toBeCloseTo(1);
            expect(r.getAt(3, 3)).toBeCloseTo(1);

            // Eigenvalues are stored in ROW 4 (sorted in ascending order)
            expect(r.getAt(4, 1)).toBeCloseTo(DEFAULT_DIAG_VALUES.a);
            expect(r.getAt(4, 2)).toBeCloseTo(DEFAULT_DIAG_VALUES.b);
            expect(r.getAt(4, 3)).toBeCloseTo(DEFAULT_DIAG_VALUES.c);

            // Off-diagonal elements in 3x3 block should be zero
            expect(r.getAt(1, 2)).toBeCloseTo(0);
            expect(r.getAt(1, 3)).toBeCloseTo(0);
            expect(r.getAt(2, 1)).toBeCloseTo(0);
            expect(r.getAt(2, 3)).toBeCloseTo(0);
            expect(r.getAt(3, 1)).toBeCloseTo(0);
            expect(r.getAt(3, 2)).toBeCloseTo(0);
        });

        it('diag3 of identity produces identity with eigenvalues (1,1,1)', () => {
            const r = mat.diag3();

            // 3x3 block should be identity (eigenvectors)
            expect(r.getAt(1, 1)).toBeCloseTo(1);
            expect(r.getAt(2, 2)).toBeCloseTo(1);
            expect(r.getAt(3, 3)).toBeCloseTo(1);

            // Row 4 contains eigenvalues (all 1 for identity matrix)
            expect(r.getAt(4, 1)).toBeCloseTo(1);
            expect(r.getAt(4, 2)).toBeCloseTo(1);
            expect(r.getAt(4, 3)).toBeCloseTo(1);

            // Last diagonal element should remain 1
            expect(r.getAt(4, 4)).toBeCloseTo(1);
        });

        it('sorts eigenvalues in ascending order', () => {
            // Create matrix with unsorted diagonal values
            const m = diagMatrix(100, 10, 1, 1234.5);
            const r = m.diag3();

            // Eigenvalues should be sorted: 1, 10, 100
            expect(r.getAt(4, 1)).toBeCloseTo(1);
            expect(r.getAt(4, 2)).toBeCloseTo(10);
            expect(r.getAt(4, 3)).toBeCloseTo(100);
        });
    });

    describe('row and column access', () => {
        it('setRow fills rows correctly', () => {
            const v = vec(1, 2, 3, 4);
            for (let i = 1; i <= 4; i++) {
                mat.setRow(i, v);
            }

            for (let i = 1; i <= 4; i++) {
                for (let j = 1; j <= 4; j++) {
                    expect(mat.getAt(i, j)).toBe(j);
                }
            }
        });

        it('setCol fills columns correctly', () => {
            const v = vec(1, 2, 3, 4);
            for (let j = 1; j <= 4; j++) {
                mat.setCol(j, v);
            }

            for (let i = 1; i <= 4; i++) {
                for (let j = 1; j <= 4; j++) {
                    expect(mat.getAt(i, j)).toBe(i);
                }
            }
        });

        it('row returns correct row vector', () => {
            for (let i = 1; i <= 4; i++) {
                for (let j = 1; j <= 4; j++) {
                    mat.setAt(i, j, j);
                }
            }

            const expected = vec(1, 2, 3, 4);
            for (let i = 1; i <= 4; i++) {
                expect(expected.equals(mat.row(i))).toBe(true);
            }
        });

        it('col returns correct column vector', () => {
            for (let i = 1; i <= 4; i++) {
                for (let j = 1; j <= 4; j++) {
                    mat.setAt(i, j, i);
                }
            }

            const expected = vec(1, 2, 3, 4);
            for (let j = 1; j <= 4; j++) {
                expect(expected.equals(mat.col(j))).toBe(true);
            }
        });

        it('setRow and row round-trip correctly', () => {
            const v = vec(5, 10, 15, 20);
            mat.setRow(2, v);
            expect(v.equals(mat.row(2))).toBe(true);
        });

        it('setCol and col round-trip correctly', () => {
            const v = vec(5, 10, 15, 20);
            mat.setCol(3, v);
            expect(v.equals(mat.col(3))).toBe(true);
        });

        it.each([1, 2, 3, 4])('setRow %i updates only that row', (rowIndex: number) => {
            const testMat = cm.createObj('Matrix') as Matrix; // Fresh identity matrix
            const testVec = vec(99, 88, 77, 66);

            testMat.setRow(rowIndex, testVec);

            // Check that only the specified row changed
            for (let i = 1; i <= 4; i++) {
                if (i === rowIndex) {
                    expect(testMat.row(i).equals(testVec)).toBe(true);
                } else {
                    // Other rows should still be identity (1 on diagonal, 0 elsewhere)
                    const rowVec = testMat.row(i);
                    for (let j = 1; j <= 4; j++) {
                        const expected = i === j ? 1 : 0;
                        const actual = j === 1 ? rowVec.x : j === 2 ? rowVec.y : j === 3 ? rowVec.z : rowVec.w;
                        expect(actual).toBe(expected);
                    }
                }
            }
        });

        it.each([1, 2, 3, 4])('setCol %i updates only that column', (colIndex: number) => {
            const testMat = cm.createObj('Matrix') as Matrix; // Fresh identity matrix
            const testVec = vec(99, 88, 77, 66);

            testMat.setCol(colIndex, testVec);

            // Check that only the specified column changed
            for (let j = 1; j <= 4; j++) {
                if (j === colIndex) {
                    expect(testMat.col(j).equals(testVec)).toBe(true);
                } else {
                    // Other columns should still be identity
                    const colVec = testMat.col(j);
                    for (let i = 1; i <= 4; i++) {
                        const expected = i === j ? 1 : 0;
                        const actual = i === 1 ? colVec.x : i === 2 ? colVec.y : i === 3 ? colVec.z : colVec.w;
                        expect(actual).toBe(expected);
                    }
                }
            }
        });
    });
});

