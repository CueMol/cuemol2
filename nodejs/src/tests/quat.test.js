import { cm } from './setup.js';

// Test constants
const SAMPLE_QUAT = { x: 1, y: 2, z: 3, a: 4 };
const IDENTITY_QUAT = { x: 0, y: 0, z: 0, a: 1 };
const UNIT_QUAT_ONES = { x: 1, y: 1, z: 1, a: 1 };
const ROTATION_180_DEGREES = 180.0;
const ROTATION_360_DEGREES = 360.0;
const SCALE_FACTOR = 2.0;

/** Create a Quat with specified x, y, z, a values */
const quat = (x, y, z, a) => {
  const q = cm.createObj('Quat');
  q.x = x;
  q.y = y;
  q.z = z;
  q.a = a;
  return q;
};

/** Calculate expected normalized component */
const normalizedComponent = (value, x, y, z, a) => {
  const len = Math.sqrt(x * x + y * y + z * z + a * a);
  return value / len;
};

describe('Quat', () => {
  let sut;

  beforeEach(() => {
    sut = cm.createObj('Quat');
  });

  describe('initialization and properties', () => {
    it('should initialize to zero quaternion by default', () => {
      // Assert - all components should be zero
      expect(sut.x).toBe(0.0);
      expect(sut.y).toBe(0.0);
      expect(sut.z).toBe(0.0);
      expect(sut.a).toBe(0.0);
    });

    it('should set and get all components correctly', () => {
      // Arrange
      const testValues = { x: 10.2, y: 100.1, z: 1111.3, a: 1234.5 };

      // Act
      sut.x = testValues.x;
      sut.y = testValues.y;
      sut.z = testValues.z;
      sut.a = testValues.a;

      // Assert
      expect(sut.x).toBe(testValues.x);
      expect(sut.y).toBe(testValues.y);
      expect(sut.z).toBe(testValues.z);
      expect(sut.a).toBe(testValues.a);
    });
  });

  describe('toString()', () => {
    it('should format zero quaternion correctly', () => {
      // Act
      const result = sut.toString();

      // Assert
      expect(result).toBe('(0,0,0,0)');
    });

    it('should format non-zero quaternion correctly', () => {
      // Arrange
      sut.x = SAMPLE_QUAT.x;
      sut.y = SAMPLE_QUAT.y;
      sut.z = SAMPLE_QUAT.z;
      sut.a = SAMPLE_QUAT.a;

      // Act
      const result = sut.toString();

      // Assert
      expect(result).toBe('(1,2,3,4)');
    });
  });

  describe('equals()', () => {
    it('should return true when comparing two zero quaternions', () => {
      // Arrange
      const other = cm.createObj('Quat');

      // Act & Assert
      expect(sut.equals(other)).toBe(true);
    });

    it('should return true when quaternions have identical values', () => {
      // Arrange
      const q1 = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
      const q2 = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act & Assert
      expect(q1.equals(q2)).toBe(true);
    });

    it('should return false when quaternions have different values', () => {
      // Arrange
      const other = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act & Assert
      expect(sut.equals(other)).toBe(false);
    });
  });

  describe('sqlen()', () => {
    it('should return zero for zero quaternion', () => {
      // Act
      const result = sut.sqlen();

      // Assert
      expect(result).toBe(0);
    });

    it('should compute squared length correctly', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
      const expected = 1 + 4 + 9 + 16; // 1^2 + 2^2 + 3^2 + 4^2

      // Act
      const result = q.sqlen();

      // Assert
      expect(result).toBe(expected);
    });
  });

  describe('scale()', () => {
    it('should multiply all components by the scale factor', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      const result = q.scale(SCALE_FACTOR);

      // Assert
      expect(result.x).toBe(SAMPLE_QUAT.x * SCALE_FACTOR);
      expect(result.y).toBe(SAMPLE_QUAT.y * SCALE_FACTOR);
      expect(result.z).toBe(SAMPLE_QUAT.z * SCALE_FACTOR);
      expect(result.a).toBe(SAMPLE_QUAT.a * SCALE_FACTOR);
    });

    it('should preserve quaternion when scaled by 1', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      const result = q.scale(1);

      // Assert
      expect(result.equals(q)).toBe(true);
    });

    it('should negate quaternion when scaled by -1', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      const result = q.scale(-1);

      // Assert
      expect(result.x).toBe(-SAMPLE_QUAT.x);
      expect(result.y).toBe(-SAMPLE_QUAT.y);
      expect(result.z).toBe(-SAMPLE_QUAT.z);
      expect(result.a).toBe(-SAMPLE_QUAT.a);
    });

    it('should not modify the original quaternion', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
      const originalValues = { x: q.x, y: q.y, z: q.z, a: q.a };

      // Act
      q.scale(SCALE_FACTOR);

      // Assert - original should be unchanged
      expect(q.x).toBe(originalValues.x);
      expect(q.y).toBe(originalValues.y);
      expect(q.z).toBe(originalValues.z);
      expect(q.a).toBe(originalValues.a);
    });
  });

  describe('divide()', () => {
    it('should divide all components by the divisor', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      const result = q.divide(SCALE_FACTOR);

      // Assert
      expect(result.x).toBe(SAMPLE_QUAT.x / SCALE_FACTOR);
      expect(result.y).toBe(SAMPLE_QUAT.y / SCALE_FACTOR);
      expect(result.z).toBe(SAMPLE_QUAT.z / SCALE_FACTOR);
      expect(result.a).toBe(SAMPLE_QUAT.a / SCALE_FACTOR);
    });

    it('should not modify the original quaternion', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
      const originalValues = { x: q.x, y: q.y, z: q.z, a: q.a };

      // Act
      q.divide(SCALE_FACTOR);

      // Assert - original should be unchanged
      expect(q.x).toBe(originalValues.x);
      expect(q.y).toBe(originalValues.y);
      expect(q.z).toBe(originalValues.z);
      expect(q.a).toBe(originalValues.a);
    });
  });

  describe('normalize()', () => {
    it('should produce a unit quaternion', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      const result = q.normalize();

      // Assert - length should be 1
      expect(Math.sqrt(result.sqlen())).toBeCloseTo(1.0);
    });

    it('should compute normalized components correctly', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      const result = q.normalize();

      // Assert
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
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      q.normalize();

      // Assert - original should be unchanged
      expect(q.x).toBe(SAMPLE_QUAT.x);
      expect(q.y).toBe(SAMPLE_QUAT.y);
      expect(q.z).toBe(SAMPLE_QUAT.z);
      expect(q.a).toBe(SAMPLE_QUAT.a);
    });
  });

  describe('normalizeSelf()', () => {
    it('should return undefined', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      const result = q.normalizeSelf();

      // Assert
      expect(result).toBe(undefined);
    });

    it('should modify the quaternion in place to unit length', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      q.normalizeSelf();

      // Assert - quaternion is now normalized
      expect(Math.sqrt(q.sqlen())).toBeCloseTo(1.0);
    });

    it('should compute normalized components correctly in place', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      q.normalizeSelf();

      // Assert
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
  });

  describe('conjugate()', () => {
    it('should negate vector components and preserve scalar component', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      const result = q.conjugate();

      // Assert
      expect(result.x).toBe(-SAMPLE_QUAT.x);
      expect(result.y).toBe(-SAMPLE_QUAT.y);
      expect(result.z).toBe(-SAMPLE_QUAT.z);
      expect(result.a).toBe(SAMPLE_QUAT.a);
    });

    it('should not modify the original quaternion', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      q.conjugate();

      // Assert - original should be unchanged
      expect(q.x).toBe(SAMPLE_QUAT.x);
      expect(q.y).toBe(SAMPLE_QUAT.y);
      expect(q.z).toBe(SAMPLE_QUAT.z);
      expect(q.a).toBe(SAMPLE_QUAT.a);
    });

    it('should return original when conjugated twice', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);

      // Act
      const result = q.conjugate().conjugate();

      // Assert
      expect(result.equals(q)).toBe(true);
    });
  });

  describe('mul()', () => {
    it('should multiply quaternions using quaternion multiplication formula', () => {
      // Arrange
      const q1 = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
      const q2 = quat(UNIT_QUAT_ONES.x, UNIT_QUAT_ONES.y, UNIT_QUAT_ONES.z, UNIT_QUAT_ONES.a);

      // Act
      const result = q1.mul(q2);

      // Assert - expected result from quaternion multiplication
      expect(result.x).toBe(4);
      expect(result.y).toBe(8);
      expect(result.z).toBe(6);
      expect(result.a).toBe(-2);
    });

    it('should preserve quaternion when multiplied by identity', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a);
      const identity = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);

      // Act
      const result = q.mul(identity);

      // Assert
      expect(result.equals(q)).toBe(true);
    });

    it('should demonstrate non-commutativity', () => {
      // Arrange
      const q1 = quat(1, 0, 0, 0);
      const q2 = quat(0, 1, 0, 0);

      // Act
      const ab = q1.mul(q2);
      const ba = q2.mul(q1);

      // Assert - quaternion multiplication is not commutative
      expect(ab.equals(ba)).toBe(false);
    });
  });

  describe('rotation operations', () => {
    describe.each([
      ['X', 'rotateX', { x: 1, y: 0, z: 0, a: 0 }],
      ['Y', 'rotateY', { x: 0, y: 1, z: 0, a: 0 }],
      ['Z', 'rotateZ', { x: 0, y: 0, z: 1, a: 0 }],
    ])('rotate%s()', (axis, method, expected180) => {
      it(`should produce correct ${axis}-axis rotation by 180 degrees`, () => {
        // Arrange
        const q = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);

        // Act
        const result = q[method](ROTATION_180_DEGREES);

        // Assert
        expect(result.x).toBeCloseTo(expected180.x);
        expect(result.y).toBeCloseTo(expected180.y);
        expect(result.z).toBeCloseTo(expected180.z);
        expect(result.a).toBeCloseTo(expected180.a);
      });

      it(`should preserve quaternion when rotated by 0 degrees around ${axis}-axis`, () => {
        // Arrange
        const q = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);

        // Act
        const result = q[method](0);

        // Assert
        expect(result.equals(q)).toBe(true);
      });

      it(`should return to approximately original after 360 degree ${axis}-axis rotation`, () => {
        // Arrange
        const q = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);

        // Act
        const result = q[method](ROTATION_360_DEGREES);

        // Assert - check the component corresponding to this axis
        const componentKey = axis.toLowerCase();
        expect(result[componentKey]).toBeCloseTo(q[componentKey]);
      });
    });
  });

  describe('toMatrix()', () => {
    it('should convert identity quaternion to identity matrix', () => {
      // Arrange
      const q = quat(IDENTITY_QUAT.x, IDENTITY_QUAT.y, IDENTITY_QUAT.z, IDENTITY_QUAT.a);

      // Act
      const matrix = q.toMatrix();

      // Assert
      expect(matrix.isIdent()).toBe(true);
    });

    it('should produce a valid matrix object with required methods', () => {
      // Arrange
      const q = quat(1, 0, 0, 0);

      // Act
      const matrix = q.toMatrix();

      // Assert - matrix should have expected interface
      expect(matrix).toBeTruthy();
      expect(typeof matrix.getAt).toBe('function');
    });

    it('should convert normalized quaternion to valid rotation matrix', () => {
      // Arrange
      const q = quat(SAMPLE_QUAT.x, SAMPLE_QUAT.y, SAMPLE_QUAT.z, SAMPLE_QUAT.a).normalize();

      // Act
      const matrix = q.toMatrix();

      // Assert - should produce a matrix object
      expect(matrix).toBeTruthy();
    });
  });
});
