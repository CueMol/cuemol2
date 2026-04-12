import { cm } from '../setup';
import { Vector } from '@/wrappers/Vector';

/**
 * Helper: Create a Vector with specified 4D components
 * @param x - X component
 * @param y - Y component
 * @param z - Z component
 * @param w - W component (default: 0)
 * @returns Vector object
 */
const createVector = (x: number, y: number, z: number, w: number = 0): Vector => {
    const v = cm.createObj('Vector') as Vector;
    v.set4(x, y, z, w);
    return v;
};

describe('Vector', () => {
    let sut: Vector;

    beforeEach(() => {
        sut = cm.createObj('Vector') as Vector;
    });

    describe('initialization and properties', () => {
        it('initializes with zero values by default', () => {
            expect(sut.x).toBe(0.0);
            expect(sut.y).toBe(0.0);
            expect(sut.z).toBe(0.0);
            expect(sut.w).toBe(0.0);
        });

        it('allows setting and getting individual components', () => {
            sut.x = 10.2;
            sut.y = 100.1;
            sut.z = 1111.3;
            sut.w = 1234.5;

            expect(sut.x).toBe(10.2);
            expect(sut.y).toBe(100.1);
            expect(sut.z).toBe(1111.3);
            expect(sut.w).toBe(1234.5);
        });

        it('handles negative component values', () => {
            sut.x = -5.5;
            sut.y = -10.0;
            sut.z = -15.25;
            sut.w = -20.5;

            expect(sut.x).toBe(-5.5);
            expect(sut.y).toBe(-10.0);
            expect(sut.z).toBe(-15.25);
            expect(sut.w).toBe(-20.5);
        });
    });

    describe('property introspection', () => {
        it('confirms existence of properties via hasProp()', () => {
            expect(sut.hasProp('x')).toBe(true);
            expect(sut.hasProp('y')).toBe(true);
            expect(sut.hasProp('z')).toBe(true);
            expect(sut.hasProp('w')).toBe(true);
            expect(sut.hasProp('strvalue')).toBe(true);
            expect(sut.hasProp('nonexistent')).toBe(false);
        });

        it('returns property metadata as JSON via getPropsJSON()', () => {
            // Arrange - set vector components to known values
            sut.x = -5.5;
            sut.y = -10.0;
            sut.z = -15.25;
            sut.w = -20.5;

            // Act - get properties as JSON string
            const jsonString = sut.getPropsJSON();
            const props = JSON.parse(jsonString);

            // Assert - verify JSON structure and values
            expect(Array.isArray(props)).toBe(true);
            expect(props.length).toBeGreaterThanOrEqual(5);

            // Find each property by name
            const strvalueProp = props.find((p: any) => p.name === 'strvalue');
            const xProp = props.find((p: any) => p.name === 'x');
            const yProp = props.find((p: any) => p.name === 'y');
            const zProp = props.find((p: any) => p.name === 'z');
            const wProp = props.find((p: any) => p.name === 'w');

            // Verify strvalue property
            expect(strvalueProp).toBeDefined();
            expect(strvalueProp.type).toBe('string');
            expect(strvalueProp.readonly).toBe(false);
            expect(strvalueProp.hasdefault).toBe(false);
            expect(strvalueProp.value).toBe('(-5.5,-10,-15.25,-20.5)');

            // Verify x property
            expect(xProp).toBeDefined();
            expect(xProp.type).toBe('real');
            expect(xProp.readonly).toBe(false);
            expect(xProp.hasdefault).toBe(false);
            expect(xProp.value).toBeCloseTo(-5.5);

            // Verify y property
            expect(yProp).toBeDefined();
            expect(yProp.type).toBe('real');
            expect(yProp.readonly).toBe(false);
            expect(yProp.hasdefault).toBe(false);
            expect(yProp.value).toBeCloseTo(-10.0);

            // Verify z property
            expect(zProp).toBeDefined();
            expect(zProp.type).toBe('real');
            expect(zProp.readonly).toBe(false);
            expect(zProp.hasdefault).toBe(false);
            expect(zProp.value).toBeCloseTo(-15.25);

            // Verify w property
            expect(wProp).toBeDefined();
            expect(wProp.type).toBe('real');
            expect(wProp.readonly).toBe(false);
            expect(wProp.hasdefault).toBe(false);
            expect(wProp.value).toBeCloseTo(-20.5);
        });
    });


    describe('set3() and set4()', () => {
        it('sets 3D vector components with set3(), preserving existing w', () => {
            sut.set3(1.0, 2.3, 4.5);

            expect(sut.x).toBe(1.0);
            expect(sut.y).toBe(2.3);
            expect(sut.z).toBe(4.5);
            // set3() preserves the w component (default is 0)
            expect(sut.w).toBe(0.0);
        });

        it('sets all 4D vector components with set4()', () => {
            sut.set4(11.0, 12.3, 14.5, 34.5);

            expect(sut.x).toBe(11.0);
            expect(sut.y).toBe(12.3);
            expect(sut.z).toBe(14.5);
            expect(sut.w).toBe(34.5);
        });

        it('allows overwriting previous values with set3()', () => {
            sut.set4(1, 2, 3, 4);
            sut.set3(10, 20, 30);

            expect(sut.x).toBe(10);
            expect(sut.y).toBe(20);
            expect(sut.z).toBe(30);
            // Note: set3() does not reset w component - it preserves the previous value
            expect(sut.w).toBe(4);
        });

        it('demonstrates that set3() only modifies x, y, z components', () => {
            // Arrange - set all 4 components first
            sut.set4(100, 200, 300, 400);

            // Act - use set3() to update only x, y, z
            sut.set3(1, 2, 3);

            // Assert - x, y, z are updated but w remains unchanged
            expect(sut.x).toBe(1);
            expect(sut.y).toBe(2);
            expect(sut.z).toBe(3);
            expect(sut.w).toBe(400); // Preserved from set4()
        });

        it('handles negative values in set methods', () => {
            sut.set3(-1.5, -2.5, -3.5);

            expect(sut.x).toBe(-1.5);
            expect(sut.y).toBe(-2.5);
            expect(sut.z).toBe(-3.5);
        });
    });

    describe('string representation', () => {
        it('returns (0,0,0) for default vector', () => {
            expect(sut.strvalue).toBe('(0,0,0)');
            expect(sut.toString()).toBe('(0,0,0)');
            // ObjID should start with "0x" 
            expect(sut.wrapped.toObjID()).toMatch(/^0x[0-9a-f]+$/i);
        });

        it('parses vector from string via strvalue setter', () => {
            sut.strvalue = '(1, 2, 3.14)';

            expect(sut.strvalue).toBe('(1,2,3.14)');
            expect(sut.x).toBe(1);
            expect(sut.y).toBe(2);
            expect(sut.z).toBe(3.14);
        });

        it('formats vector string without spaces', () => {
            sut.set3(1, 2, 3);

            expect(sut.toString()).toBe('(1,2,3)');
        });

        it('handles 4D vectors in string representation', () => {
            sut.set4(1, 2, 3, 4);

            expect(sut.toString()).toContain('1');
            expect(sut.toString()).toContain('2');
            expect(sut.toString()).toContain('3');
        });
    });

    describe('equality and zero checks', () => {
        it('returns true for equals() when vectors match', () => {
            const v1 = createVector(0, 0, 0);

            expect(sut.equals(v1)).toBe(true);
        });

        it('returns false for equals() when vectors differ', () => {
            const v1 = createVector(1, 2, 3);

            expect(sut.equals(v1)).toBe(false);
        });

        it('identifies zero vector with isZero()', () => {
            expect(sut.isZero()).toBe(true);
        });

        it('returns false for isZero() on non-zero vector', () => {
            sut.set3(1, 0, 0);

            expect(sut.isZero()).toBe(false);
        });

        it('recognizes zero vector after calling zero()', () => {
            sut.set4(5, 10, 15, 20);
            sut.zero();

            expect(sut.x).toBe(0);
            expect(sut.y).toBe(0);
            expect(sut.z).toBe(0);
            expect(sut.w).toBe(0);
            expect(sut.isZero()).toBe(true);
        });
    });

    describe('length calculations', () => {
        it('computes squared length correctly', () => {
            const v = createVector(1, 2, 3, 4);

            // sqlen = 1² + 2² + 3² + 4² = 1 + 4 + 9 + 16 = 30
            expect(v.sqlen()).toBe(30);
        });

        it('computes vector length correctly', () => {
            const v = createVector(1, 2, 3, 4);

            // length = sqrt(30) ≈ 5.477
            expect(v.length()).toBeCloseTo(Math.sqrt(30));
        });

        it('returns 0 for length of zero vector', () => {
            expect(sut.sqlen()).toBe(0);
            expect(sut.length()).toBe(0);
        });

        it('handles unit vector length calculation', () => {
            const v = createVector(1, 0, 0, 0);

            expect(v.sqlen()).toBe(1);
            expect(v.length()).toBe(1);
        });

        it('computes length for 3D vector (w=0)', () => {
            const v = createVector(3, 4, 0, 0);

            // 3² + 4² = 9 + 16 = 25, sqrt(25) = 5
            expect(v.length()).toBe(5);
        });
    });

    describe('scalar operations', () => {
        it('scales vector by positive scalar', () => {
            const v = createVector(1, 2, 3, 4);
            const scaled = v.scale(2);

            expect(scaled.x).toBe(2);
            expect(scaled.y).toBe(4);
            expect(scaled.z).toBe(6);
            expect(scaled.w).toBe(8);
        });

        it('scales vector by negative scalar', () => {
            const v = createVector(1, 2, 3, 4);
            const scaled = v.scale(-1);

            expect(scaled.x).toBe(-1);
            expect(scaled.y).toBe(-2);
            expect(scaled.z).toBe(-3);
            expect(scaled.w).toBe(-4);
        });

        it('scales vector by fractional scalar', () => {
            const v = createVector(2, 4, 6, 8);
            const scaled = v.scale(0.5);

            expect(scaled.x).toBe(1);
            expect(scaled.y).toBe(2);
            expect(scaled.z).toBe(3);
            expect(scaled.w).toBe(4);
        });

        it('returns zero vector when scaled by 0', () => {
            const v = createVector(1, 2, 3, 4);
            const scaled = v.scale(0);

            expect(scaled.isZero()).toBe(true);
        });

        it('divides vector by scalar', () => {
            const v = createVector(1, 2, 3, 4);
            const divided = v.divide(2);

            expect(divided.x).toBe(0.5);
            expect(divided.y).toBe(1);
            expect(divided.z).toBe(1.5);
            expect(divided.w).toBe(2);
        });

        it('divides vector by fractional value', () => {
            const v = createVector(1, 2, 3, 4);
            const divided = v.divide(0.5);

            expect(divided.x).toBe(2);
            expect(divided.y).toBe(4);
            expect(divided.z).toBe(6);
            expect(divided.w).toBe(8);
        });
    });

    describe('normalization', () => {
        it('normalizes vector to unit length', () => {
            const v = createVector(1, 2, 3, 4);
            const normalized = v.normalize();
            const len = Math.sqrt(1 + 4 + 9 + 16);

            expect(normalized.x).toBeCloseTo(1 / len);
            expect(normalized.y).toBeCloseTo(2 / len);
            expect(normalized.z).toBeCloseTo(3 / len);
            expect(normalized.w).toBeCloseTo(4 / len);
        });

        it('produces unit length vector after normalization', () => {
            const v = createVector(3, 4, 0, 0);
            const normalized = v.normalize();

            expect(normalized.length()).toBeCloseTo(1.0);
        });

        it('maintains direction after normalization', () => {
            const v = createVector(5, 0, 0, 0);
            const normalized = v.normalize();

            expect(normalized.x).toBeCloseTo(1);
            expect(normalized.y).toBeCloseTo(0);
            expect(normalized.z).toBeCloseTo(0);
        });
    });

    describe('cross product', () => {
        it('computes cross product of 3D vectors', () => {
            const v1 = createVector(1, 2, 3, 0);
            const v2 = createVector(1, 1, 1, 1);
            const result = v1.cross(v2);

            // (2×1 - 3×1, 3×1 - 1×1, 1×1 - 2×1) = (-1, 2, -1)
            expect(result.x).toBe(-1);
            expect(result.y).toBe(2);
            expect(result.z).toBe(-1);
            expect(result.w).toBe(0);
        });

        it('returns zero vector for parallel vectors', () => {
            const v1 = createVector(1, 2, 3, 0);
            const v2 = createVector(2, 4, 6, 0);
            const result = v1.cross(v2);

            expect(result.isZero()).toBe(true);
        });

        it('computes cross product perpendicular to both inputs', () => {
            const v1 = createVector(1, 0, 0, 0);
            const v2 = createVector(0, 1, 0, 0);
            const result = v1.cross(v2);

            // i × j = k
            expect(result.x).toBe(0);
            expect(result.y).toBe(0);
            expect(result.z).toBe(1);
        });

        it('is anticommutative: v1 × v2 = -(v2 × v1)', () => {
            const v1 = createVector(1, 2, 3, 0);
            const v2 = createVector(4, 5, 6, 0);
            const cross1 = v1.cross(v2);
            const cross2 = v2.cross(v1);

            expect(cross1.x).toBeCloseTo(-cross2.x);
            expect(cross1.y).toBeCloseTo(-cross2.y);
            expect(cross1.z).toBeCloseTo(-cross2.z);
        });
    });

    describe('dot product', () => {
        it('computes dot product of 4D vectors', () => {
            const v1 = createVector(1, 2, 3, 4);
            const v2 = createVector(1, 1, 1, 1);

            // 1×1 + 2×1 + 3×1 + 4×1 = 10
            expect(v1.dot(v2)).toBe(10);
        });

        it('returns 0 for orthogonal vectors', () => {
            const v1 = createVector(1, 0, 0, 0);
            const v2 = createVector(0, 1, 0, 0);

            expect(v1.dot(v2)).toBe(0);
        });

        it('returns squared length when dotted with itself', () => {
            const v = createVector(2, 3, 4, 5);

            expect(v.dot(v)).toBe(v.sqlen());
        });

        it('is commutative: v1·v2 = v2·v1', () => {
            const v1 = createVector(1, 2, 3, 4);
            const v2 = createVector(5, 6, 7, 8);

            expect(v1.dot(v2)).toBe(v2.dot(v1));
        });

        it('handles negative components', () => {
            const v1 = createVector(1, -2, 3, -4);
            const v2 = createVector(2, 2, 2, 2);

            // 1×2 + (-2)×2 + 3×2 + (-4)×2 = 2 - 4 + 6 - 8 = -4
            expect(v1.dot(v2)).toBe(-4);
        });
    });

    describe('angle between vectors', () => {
        it('computes angle between vectors in radians', () => {
            const v1 = createVector(1, 2, 3, 0);
            const v2 = createVector(1, 1, 1, 0);

            expect(v1.angle(v2)).toBeCloseTo(0.3875966866551805);
        });

        it('returns 0 for parallel vectors pointing same direction', () => {
            const v1 = createVector(1, 2, 3, 0);
            const v2 = createVector(2, 4, 6, 0);

            expect(v1.angle(v2)).toBeCloseTo(0);
        });

        it('returns π for parallel vectors pointing opposite directions', () => {
            const v1 = createVector(1, 0, 0, 0);
            const v2 = createVector(-1, 0, 0, 0);

            expect(v1.angle(v2)).toBeCloseTo(Math.PI);
        });

        it('returns π/2 for perpendicular vectors', () => {
            const v1 = createVector(1, 0, 0, 0);
            const v2 = createVector(0, 1, 0, 0);

            expect(v1.angle(v2)).toBeCloseTo(Math.PI / 2);
        });
    });

    describe('vector addition', () => {
        it('adds two vectors component-wise', () => {
            const v1 = createVector(1, 2, 3, 4);
            const v2 = createVector(1, 2, 3, 4);
            const result = v1.add(v2);

            expect(result.x).toBe(2);
            expect(result.y).toBe(4);
            expect(result.z).toBe(6);
            expect(result.w).toBe(8);
        });

        it('is commutative: v1 + v2 = v2 + v1', () => {
            const v1 = createVector(1, 2, 3, 4);
            const v2 = createVector(5, 6, 7, 8);
            const sum1 = v1.add(v2);
            const sum2 = v2.add(v1);

            expect(sum1.equals(sum2)).toBe(true);
        });

        it('adds zero vector as identity operation', () => {
            const v = createVector(1, 2, 3, 4);
            const zero = createVector(0, 0, 0, 0);
            const result = v.add(zero);

            expect(result.equals(v)).toBe(true);
        });

        it('handles negative components in addition', () => {
            const v1 = createVector(5, -3, 2, -1);
            const v2 = createVector(-2, 7, -4, 3);
            const result = v1.add(v2);

            expect(result.x).toBe(3);
            expect(result.y).toBe(4);
            expect(result.z).toBe(-2);
            expect(result.w).toBe(2);
        });
    });

    describe('vector subtraction', () => {
        it('subtracts two vectors component-wise', () => {
            const v1 = createVector(1, 2, 3, 4);
            const v2 = createVector(1, 2, 3, 4);
            const result = v1.sub(v2);

            expect(result.isZero()).toBe(true);
        });

        it('produces zero vector when subtracting from itself', () => {
            const v = createVector(5, 10, 15, 20);
            const result = v.sub(v);

            expect(result.isZero()).toBe(true);
        });

        it('handles asymmetric subtraction', () => {
            const v1 = createVector(10, 8, 6, 4);
            const v2 = createVector(1, 2, 3, 4);
            const result = v1.sub(v2);

            expect(result.x).toBe(9);
            expect(result.y).toBe(6);
            expect(result.z).toBe(3);
            expect(result.w).toBe(0);
        });

        it('negates vector when subtracting from zero', () => {
            const v = createVector(1, 2, 3, 4);
            const zero = createVector(0, 0, 0, 0);
            const result = zero.sub(v);

            expect(result.x).toBe(-1);
            expect(result.y).toBe(-2);
            expect(result.z).toBe(-3);
            expect(result.w).toBe(-4);
        });
    });

    describe('edge cases and corner cases', () => {
        it('handles very large component values', () => {
            const v = createVector(1e10, 2e10, 3e10, 4e10);

            expect(v.x).toBe(1e10);
            expect(v.sqlen()).toBeCloseTo(30e20);
        });

        it('handles very small component values near zero tolerance', () => {
            const v = createVector(1e-10, 2e-10, 3e-10, 4e-10);

            expect(v.x).toBeCloseTo(1e-10);
            // Note: isZero() uses epsilon tolerance for floating point comparison
            // Values near machine epsilon may be considered zero
            expect(v.isZero()).toBe(true);
        });

        it('recognizes non-zero vectors above epsilon tolerance', () => {
            const v = createVector(1e-6, 2e-6, 3e-6, 4e-6);

            expect(v.isZero()).toBe(false);
            expect(v.length()).toBeGreaterThan(0);
        });

        it('maintains precision in chained operations', () => {
            const v1 = createVector(1, 2, 3, 4);
            const v2 = createVector(5, 6, 7, 8);

            // (v1 + v2) - v2 should equal v1
            const result = v1.add(v2).sub(v2);

            expect(result.x).toBeCloseTo(v1.x);
            expect(result.y).toBeCloseTo(v1.y);
            expect(result.z).toBeCloseTo(v1.z);
            expect(result.w).toBeCloseTo(v1.w);
        });

        it('handles operations on vectors with mixed positive/negative/zero components', () => {
            const v1 = createVector(0, -5, 0, 10);
            const v2 = createVector(3, 0, -7, 0);
            const sum = v1.add(v2);

            expect(sum.x).toBe(3);
            expect(sum.y).toBe(-5);
            expect(sum.z).toBe(-7);
            expect(sum.w).toBe(10);
        });

        it('preserves immutability - operations return new vectors', () => {
            const v1 = createVector(1, 2, 3, 4);
            const originalX = v1.x;

            const scaled = v1.scale(2);

            // Original should be unchanged
            expect(v1.x).toBe(originalX);
            expect(scaled.x).toBe(originalX * 2);
        });
    });
});
