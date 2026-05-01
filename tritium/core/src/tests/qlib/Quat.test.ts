import { Quat } from '@/wrappers/Quat';
import { cm } from '../setup';

// Test constants
const SAMPLE_QUAT = { x: 1, y: 2, z: 3, a: 4 } as const;
const IDENTITY_QUAT = { x: 0, y: 0, z: 0, a: 1 } as const;
const UNIT_QUAT_ONES = { x: 1, y: 1, z: 1, a: 1 } as const;

const ROTATION_180_DEGREES = 180.0;
const ROTATION_360_DEGREES = 360.0;
const SCALE_FACTOR = 2.0;

/** Create a Quat with specified x, y, z, a values */
const quat = (x: number, y: number, z: number, a: number): Quat => {
    const q = cm.createObj('Quat') as Quat;
    q.x = x;
    q.y = y;
    q.z = z;
    q.a = a;
    return q;
};

/** Calculate expected normalized component */
const normalizedComponent = (value: number, x: number, y: number, z: number, a: number): number => {
    const len = Math.sqrt(x * x + y * y + z * z + a * a);
    return value / len;
};

describe('Quat', () => {
    let sut: Quat;

    beforeEach(() => {
        sut = cm.createObj('Quat') as Quat;
    });

    describe('initialization and properties', () => {
        it('should initialize to zero quaternion by default', () => {
            expect(sut.x).toBe(0.0);
            expect(sut.y).toBe(0.0);
            expect(sut.z).toBe(0.0);
            expect(sut.a).toBe(0.0);
        });

        it('should set and get all components correctly', () => {
            const testValues = { x: 10.2, y: 100.1, z: 1111.3, a: 1234.5 };

            sut.x = testValues.x;
            sut.y = testValues.y;
            sut.z = testValues.z;
            sut.a = testValues.a;

            expect(sut.x).toBe(testValues.x);
            expect(sut.y).toBe(testValues.y);
            expect(sut.z).toBe(testValues.z);
            expect(sut.a).toBe(testValues.a);
        });
    });

    describe('toString()', () => {
        it('should format zero quaternion correctly', () => {
            expect(sut.toString()).toBe('(0,0,0,0)');
        });

        it('should format identity quaternion correctly', () => {
            sut.x = IDENTITY_QUAT.x;
            sut.y = IDENTITY_QUAT.y;
            sut.z = IDENTITY_QUAT.z;
            sut.a = IDENTITY_QUAT.a;

            expect(sut.toString()).toBe('(0,0,0,1)');
        });

        it('should format non-zero quaternion correctly', () => {
            sut.x = SAMPLE_QUAT.x;
            sut.y = SAMPLE_QUAT.y;
            sut.z = SAMPLE_QUAT.z;
            sut.a = SAMPLE_QUAT.a;

            expect(sut.toString()).toBe('(1,2,3,4)');
        });
    });

    describe('equals()', () => {
        it('should return true when comparing two zero quaternions', () => {
            const other = cm.createObj('Quat') as Quat;
            expect(sut.equals(other)).toBe(true);
        });

        it('should return true when quaternions have identical values', () => {
            const q1 = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const q2 = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

            expect(q1.equals(q2)).toBe(true);
        });

        it('should return false when quaternions have different values', () => {
            const other = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            expect(sut.equals(other)).toBe(false);
        });
    });

    describe('sqlen()', () => {
        it('should return zero for zero quaternion', () => {
            expect(sut.sqlen()).toBe(0);
        });

        it('should compute squared length correctly', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const expected = 1 + 4 + 9 + 16; // 1^2 + 2^2 + 3^2 + 4^2

            expect(q.sqlen()).toBe(expected);
        });
    });

    describe('scale()', () => {
        it('should multiply all components by the scale factor', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const result = q.scale(SCALE_FACTOR);

            expect(result.x).toBe(SAMPLE_QUAT.x * SCALE_FACTOR);
            expect(result.y).toBe(SAMPLE_QUAT.y * SCALE_FACTOR);
            expect(result.z).toBe(SAMPLE_QUAT.z * SCALE_FACTOR);
            expect(result.a).toBe(SAMPLE_QUAT.a * SCALE_FACTOR);
        });

        it('should preserve quaternion when scaled by 1', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const result = q.scale(1);

            expect(result.equals(q)).toBe(true);
        });

        it('should negate quaternion when scaled by -1', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const result = q.scale(-1);

            expect(result.x).toBe(-SAMPLE_QUAT.x);
            expect(result.y).toBe(-SAMPLE_QUAT.y);
            expect(result.z).toBe(-SAMPLE_QUAT.z);
            expect(result.a).toBe(-SAMPLE_QUAT.a);
        });

        it('should not modify the original quaternion', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const originalValues = { x: q.x, y: q.y, z: q.z, a: q.a };

            q.scale(SCALE_FACTOR);

            expect(q.x).toBe(originalValues.x);
            expect(q.y).toBe(originalValues.y);
            expect(q.z).toBe(originalValues.z);
            expect(q.a).toBe(originalValues.a);
        });
    });

    describe('divide()', () => {
        it('should divide all components by the divisor', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const result = q.divide(SCALE_FACTOR);

            expect(result.x).toBe(SAMPLE_QUAT.x / SCALE_FACTOR);
            expect(result.y).toBe(SAMPLE_QUAT.y / SCALE_FACTOR);
            expect(result.z).toBe(SAMPLE_QUAT.z / SCALE_FACTOR);
            expect(result.a).toBe(SAMPLE_QUAT.a / SCALE_FACTOR);
        });

        it('should be inverse of scale operation', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const scaled = q.scale(SCALE_FACTOR);
            const divided = scaled.divide(SCALE_FACTOR);

            expect(divided.equals(q)).toBe(true);
        });

        it('should not modify the original quaternion', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const originalValues = { x: q.x, y: q.y, z: q.z, a: q.a };

            q.divide(SCALE_FACTOR);

            expect(q.x).toBe(originalValues.x);
            expect(q.y).toBe(originalValues.y);
            expect(q.z).toBe(originalValues.z);
            expect(q.a).toBe(originalValues.a);
        });
    });

    describe('normalize()', () => {
        it('should produce a unit quaternion', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const result = q.normalize();

            expect(Math.sqrt(result.sqlen())).toBeCloseTo(1.0);
        });

        it('should compute normalized components correctly', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const result = q.normalize();

            expect(result.x).toBeCloseTo(
                normalizedComponent(SAMPLE_QUAT.x, SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a)
            );
            expect(result.y).toBeCloseTo(
                normalizedComponent(SAMPLE_QUAT.y, SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a)
            );
            expect(result.z).toBeCloseTo(
                normalizedComponent(SAMPLE_QUAT.z, SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a)
            );
            expect(result.a).toBeCloseTo(
                normalizedComponent(SAMPLE_QUAT.a, SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a)
            );
        });

        it('should not modify the original quaternion', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

            q.normalize();

            expect(q.x).toBe(SAMPLE_QUAT.x);
            expect(q.y).toBe(SAMPLE_QUAT.y);
            expect(q.z).toBe(SAMPLE_QUAT.z);
            expect(q.a).toBe(SAMPLE_QUAT.a);
        });
    });

    describe('normalizeSelf()', () => {
        it('should return undefined', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const result = q.normalizeSelf();

            expect(result).toBe(undefined);
        });

        it('should modify the quaternion in place to unit length', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            q.normalizeSelf();

            expect(Math.sqrt(q.sqlen())).toBeCloseTo(1.0);
        });

        it('should compute normalized components correctly in place', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            q.normalizeSelf();

            expect(q.x).toBeCloseTo(
                normalizedComponent(SAMPLE_QUAT.x, SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a)
            );
            expect(q.y).toBeCloseTo(
                normalizedComponent(SAMPLE_QUAT.y, SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a)
            );
            expect(q.z).toBeCloseTo(
                normalizedComponent(SAMPLE_QUAT.z, SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a)
            );
            expect(q.a).toBeCloseTo(
                normalizedComponent(SAMPLE_QUAT.a, SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a)
            );
        });

        it('should produce same result as normalize()', () => {
            const q1 = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const q2 = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

            const normalized = q1.normalize();
            q2.normalizeSelf();

            expect(q2.equals(normalized)).toBe(true);
        });
    });

    describe('conjugate()', () => {
        it('should negate vector components and preserve scalar component', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const result = q.conjugate();

            expect(result.x).toBe(-SAMPLE_QUAT.x);
            expect(result.y).toBe(-SAMPLE_QUAT.y);
            expect(result.z).toBe(-SAMPLE_QUAT.z);
            expect(result.a).toBe(SAMPLE_QUAT.a);
        });

        it('should not modify the original quaternion', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

            q.conjugate();

            expect(q.x).toBe(SAMPLE_QUAT.x);
            expect(q.y).toBe(SAMPLE_QUAT.y);
            expect(q.z).toBe(SAMPLE_QUAT.z);
            expect(q.a).toBe(SAMPLE_QUAT.a);
        });

        it('should return original when conjugated twice', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const result = q.conjugate().conjugate();

            expect(result.equals(q)).toBe(true);
        });
    });

    describe('mul()', () => {
        it('should multiply quaternions using quaternion multiplication formula', () => {
            const q1 = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const q2 = quat(UNIT_QUAT_ONES.x, UNIT_QUAT_ONES.y, UNIT_QUAT_ONES.z, UNIT_QUAT_ONES.a);

            const result = q1.mul(q2);

            // Expected result from quaternion multiplication formula
            expect(result.x).toBe(4);
            expect(result.y).toBe(8);
            expect(result.z).toBe(6);
            expect(result.a).toBe(-2);
        });

        it('should preserve quaternion when multiplied by identity', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
            const identity = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);

            const result = q.mul(identity);

            expect(result.equals(q)).toBe(true);
        });

        it('should demonstrate non-commutativity', () => {
            const q1 = quat(1, 0, 0, 0);
            const q2 = quat(0, 1, 0, 0);

            const ab = q1.mul(q2);
            const ba = q2.mul(q1);

            expect(ab.equals(ba)).toBe(false);
        });

        it('should be associative', () => {
            const q1 = quat(1, 2, 3, 4);
            const q2 = quat(5, 6, 7, 8);
            const q3 = quat(9, 10, 11, 12);

            const result1 = q1.mul(q2).mul(q3);
            const result2 = q1.mul(q2.mul(q3));

            expect(result1.x).toBeCloseTo(result2.x);
            expect(result1.y).toBeCloseTo(result2.y);
            expect(result1.z).toBeCloseTo(result2.z);
            expect(result1.a).toBeCloseTo(result2.a);
        });

        it('should satisfy (q1 * q2).conjugate() = q2.conjugate() * q1.conjugate()', () => {
            const q1 = quat(1, 2, 3, 4);
            const q2 = quat(5, 6, 7, 8);

            const lhs = q1.mul(q2).conjugate();
            const rhs = q2.conjugate().mul(q1.conjugate());

            expect(lhs.x).toBeCloseTo(rhs.x);
            expect(lhs.y).toBeCloseTo(rhs.y);
            expect(lhs.z).toBeCloseTo(rhs.z);
            expect(lhs.a).toBeCloseTo(rhs.a);
        });
    });

    describe('rotation operations', () => {
        describe.each([
            ['X', 'rotateX', { x: 1, y: 0, z: 0, a: 0 }] as const,
            ['Y', 'rotateY', { x: 0, y: 1, z: 0, a: 0 }] as const,
            ['Z', 'rotateZ', { x: 0, y: 0, z: 1, a: 0 }] as const,
        ])('rotate%s()', (axis, method, expected180) => {
            it(`should produce correct ${axis}-axis rotation by 180 degrees`, () => {
                const q = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);
                const result = q[method](ROTATION_180_DEGREES);

                expect(result.x).toBeCloseTo(expected180.x);
                expect(result.y).toBeCloseTo(expected180.y);
                expect(result.z).toBeCloseTo(expected180.z);
                expect(result.a).toBeCloseTo(expected180.a);
            });

            it(`should preserve identity when rotated by 0 degrees around ${axis}-axis`, () => {
                const q = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);
                const result = q[method](0);

                expect(result.equals(q)).toBe(true);
            });

            it(`should negate quaternion after 360 degree ${axis}-axis rotation (double cover)`, () => {
                const q = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);
                const result = q[method](ROTATION_360_DEGREES);

                // Quaternion double cover: 360° rotation gives -q, not q
                expect(result.x).toBeCloseTo(-q.x, 5);
                expect(result.y).toBeCloseTo(-q.y, 5);
                expect(result.z).toBeCloseTo(-q.z, 5);
                expect(result.a).toBeCloseTo(-q.a, 5);
            });
        });
    });

    describe('toMatrix()', () => {
        it('should convert identity quaternion to identity matrix', () => {
            const q = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);
            const matrix = q.toMatrix();

            expect(matrix.isIdent()).toBe(true);
        });

        it('should produce a valid matrix object with required methods', () => {
            const q = quat(1, 0, 0, 0);
            const matrix = q.toMatrix();

            expect(matrix).toBeTruthy();
            expect(typeof matrix.getAt).toBe('function');
            expect(typeof matrix.isIdent).toBe('function');
        });

        it('should convert normalized quaternion to valid rotation matrix', () => {
            const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a).normalize();
            const matrix = q.toMatrix();

            expect(matrix).toBeTruthy();
        });
    });

    describe('edge cases', () => {
        it('should handle negative rotation angles', () => {
            const q = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);
            const positive = q.rotateX(90);
            const negative = q.rotateX(-90);

            // Negative rotation should be conjugate of positive rotation
            const negConj = negative.conjugate();

            expect(positive.x).toBeCloseTo(negConj.x, 5);
            expect(positive.y).toBeCloseTo(negConj.y, 5);
            expect(positive.z).toBeCloseTo(negConj.z, 5);
            expect(positive.a).toBeCloseTo(negConj.a, 5);
        });

        it('should handle chained operations correctly', () => {
            const q = quat(1, 2, 3, 4);

            // Chain multiple operations
            const result = q
                .normalize()
                .rotateX(45)
                .rotateY(30)
                .rotateZ(60);

            // Result should still be a unit quaternion
            expect(Math.sqrt(result.sqlen())).toBeCloseTo(1.0);
        });
    });
});
