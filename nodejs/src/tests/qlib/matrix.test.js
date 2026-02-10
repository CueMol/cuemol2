import { cm } from '../setup.js';

/** Create a Vector with 3 or 4 components */
const vec = (x, y, z, w) => {
  const v = cm.createObj('Vector');
  w !== undefined ? v.set4(x, y, z, w) : v.set3(x, y, z);
  return v;
};

/** Create a diagonal matrix with given values */
const diagMatrix = (a = 10.2, b = 100.1, c = 1111.3, d = 1234.5) => {
  const m = cm.createObj('Matrix');
  m.setAt(1, 1, a);
  m.setAt(2, 2, b);
  m.setAt(3, 3, c);
  m.setAt(4, 4, d);
  return m;
};

/** Assert all off-diagonal elements are zero */
const expectOffDiagonalZero = (m) => {
  for (let i = 1; i <= 4; i++)
    for (let j = 1; j <= 4; j++)
      if (i !== j) expect(m.getAt(i, j)).toBe(0);
};

/** Assert matrix is identity */
const expectIdentity = (m) => {
  for (let i = 1; i <= 4; i++)
    for (let j = 1; j <= 4; j++)
      expect(m.getAt(i, j)).toBe(i === j ? 1 : 0);
};

/** Assert matrix is all zeros */
const expectAllZero = (m) => {
  for (let i = 1; i <= 4; i++)
    for (let j = 1; j <= 4; j++)
      expect(m.getAt(i, j)).toBe(0);
};

describe('Matrix', () => {
  let mat;

  beforeEach(() => {
    mat = cm.createObj('Matrix');
  });

  describe('element access', () => {
    it('sets and gets diagonal elements', () => {
      mat.setAt(1, 1, 10.2);
      mat.setAt(2, 2, 100.1);
      mat.setAt(3, 3, 1111.3);
      mat.setAt(4, 4, 1234.5);

      expect(mat.getAt(1, 1)).toBe(10.2);
      expect(mat.getAt(2, 2)).toBe(100.1);
      expect(mat.getAt(3, 3)).toBe(1111.3);
      expect(mat.getAt(4, 4)).toBe(1234.5);
    });

    it('sets and gets off-diagonal elements', () => {
      mat.setAt(1, 3, 42.0);
      mat.setAt(3, 1, 99.9);

      expect(mat.getAt(1, 3)).toBe(42.0);
      expect(mat.getAt(3, 1)).toBe(99.9);
    });

    it.each([
      ['setAt', (m) => m.setAt(100, 1, 0)],
      ['setAt', (m) => m.setAt(1, 100, 0)],
      ['getAt', (m) => m.getAt(100, 1)],
      ['getAt', (m) => m.getAt(1, 100)],
      ['addAt', (m) => m.addAt(100, 1, 0)],
      ['addAt', (m) => m.addAt(1, 100, 0)],
    ])('%s throws on out-of-range index', (_name, fn) => {
      expect(() => fn(mat)).toThrow();
    });

    it('addAt accumulates onto existing value', () => {
      mat.addAt(1, 1, 10.2);
      mat.addAt(2, 2, 100.1);

      // Default identity has 1 on diagonal
      expect(mat.getAt(1, 1)).toBe(1 + 10.2);
      expect(mat.getAt(2, 2)).toBe(1 + 100.1);
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

    it('isZero returns true only for zero matrix', () => {
      expect(mat.isZero()).toBe(false);
      mat.setZero();
      expect(mat.isZero()).toBe(true);
    });

    it('isIdent returns false after modification', () => {
      mat.setAt(1, 2, 5.0);
      expect(mat.isIdent()).toBe(false);
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
  });

  describe('scalar arithmetic', () => {
    it('scale multiplies all elements', () => {
      const m = diagMatrix();
      const r = m.scale(2.0);

      expect(r.getAt(1, 1)).toBe(10.2 * 2);
      expect(r.getAt(2, 2)).toBe(100.1 * 2);
      expect(r.getAt(3, 3)).toBe(1111.3 * 2);
      expect(r.getAt(4, 4)).toBe(1234.5 * 2);
      expectOffDiagonalZero(r);
    });

    it('divide divides all elements', () => {
      const m = diagMatrix();
      const r = m.divide(2.0);

      expect(r.getAt(1, 1)).toBe(10.2 / 2);
      expect(r.getAt(2, 2)).toBe(100.1 / 2);
      expect(r.getAt(3, 3)).toBe(1111.3 / 2);
      expect(r.getAt(4, 4)).toBe(1234.5 / 2);
      expectOffDiagonalZero(r);
    });

    it('scale(1) preserves the matrix', () => {
      const m = diagMatrix();
      const r = m.scale(1.0);
      expect(r.equals(m)).toBe(true);
    });

    it('scale(0) produces zero matrix', () => {
      const m = diagMatrix();
      const r = m.scale(0.0);
      expect(r.isZero()).toBe(true);
    });

    it('scale(-1) negates all elements', () => {
      const m = diagMatrix();
      const r = m.scale(-1.0);

      expect(r.getAt(1, 1)).toBe(-10.2);
      expect(r.getAt(2, 2)).toBe(-100.1);
      expect(r.getAt(3, 3)).toBe(-1111.3);
      expect(r.getAt(4, 4)).toBe(-1234.5);
    });
  });

  describe('matrix arithmetic', () => {
    it('add sums element-wise', () => {
      const m2 = diagMatrix();
      const r = mat.add(m2); // identity + diag

      expect(r.getAt(1, 1)).toBe(1 + 10.2);
      expect(r.getAt(2, 2)).toBe(1 + 100.1);
      expect(r.getAt(3, 3)).toBe(1 + 1111.3);
      expect(r.getAt(4, 4)).toBe(1 + 1234.5);
      expectOffDiagonalZero(r);
    });

    it('sub subtracts element-wise', () => {
      const m2 = diagMatrix();
      const r = m2.sub(mat); // diag - identity

      expect(r.getAt(1, 1)).toBe(10.2 - 1);
      expect(r.getAt(2, 2)).toBe(100.1 - 1);
      expect(r.getAt(3, 3)).toBe(1111.3 - 1);
      expect(r.getAt(4, 4)).toBe(1234.5 - 1);
      expectOffDiagonalZero(r);
    });

    it('sub self produces zero matrix', () => {
      const m = diagMatrix();
      const r = m.sub(m);
      expect(r.isZero()).toBe(true);
    });

    it('mul with identity preserves the matrix', () => {
      const m2 = diagMatrix();
      const r = mat.mul(m2); // identity * diag

      expect(r.getAt(1, 1)).toBe(10.2);
      expect(r.getAt(2, 2)).toBe(100.1);
      expect(r.getAt(3, 3)).toBe(1111.3);
      expect(r.getAt(4, 4)).toBe(1234.5);
      expectOffDiagonalZero(r);
    });

    it('mul is not commutative in general', () => {
      const a = cm.createObj('Matrix');
      a.setAt(1, 2, 1.0);
      const b = cm.createObj('Matrix');
      b.setAt(2, 1, 1.0);

      const ab = a.mul(b);
      const ba = b.mul(a);
      expect(ab.equals(ba)).toBe(false);
    });

    it('mulvec transforms vector by matrix', () => {
      const m = diagMatrix();
      const v = m.mulvec(vec(1, 2, 3, 4));

      expect(v.x).toBeCloseTo(10.2);
      expect(v.y).toBeCloseTo(200.2);
      expect(v.z).toBeCloseTo(3333.9);
      expect(v.w).toBeCloseTo(4938.0);
    });

    it('identity mulvec preserves vector', () => {
      const v = mat.mulvec(vec(1, 2, 3, 4));

      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
      expect(v.w).toBe(4);
    });
  });

  describe('transforms', () => {
    it('setRotate produces correct rotation matrix', () => {
      const cen = vec(1, 1, 1);
      const ax = vec(1, 1, 1).normalize();
      mat.setRotate(cen, ax, 60.0);

      // Expected: 60-degree rotation around (1,1,1) axis
      const expected = [
        [0.6666667, 0.6666667, -0.3333333, 0],
        [-0.3333333, 0.6666667, 0.6666667, 0],
        [0.6666667, -0.3333333, 0.6666667, 0],
        [0, 0, 0, 1],
      ];

      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++)
          expect(mat.getAt(i + 1, j + 1)).toBeCloseTo(expected[i][j]);
    });

    it('setTranslate produces correct translation matrix', () => {
      mat.setTranslate(vec(1, 1, 1));

      for (let i = 1; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) {
          if (i === j) expect(mat.getAt(i, j)).toBe(1);
          else if (j === 4) expect(mat.getAt(i, j)).toBe(1);
          else expect(mat.getAt(i, j)).toBe(0);
        }
      }
    });

    it('setTranslate with zero vector produces identity', () => {
      mat.setTranslate(vec(0, 0, 0));
      expectIdentity(mat);
    });
  });

  describe('diag3', () => {
    it('returns 3x3 inverse with translation component', () => {
      const m = diagMatrix();
      const r = m.diag3();

      // Upper-left 3x3 block
      expect(r.getAt(1, 1)).toBeCloseTo(1);
      expect(r.getAt(2, 2)).toBeCloseTo(1);
      expect(r.getAt(3, 3)).toBeCloseTo(1);

      // Translation column
      expect(r.getAt(4, 1)).toBeCloseTo(10.2);
      expect(r.getAt(4, 2)).toBeCloseTo(100.1);
      expect(r.getAt(4, 3)).toBeCloseTo(1111.3);
    });
  });

  describe('row and column access', () => {
    it('setRow fills rows correctly', () => {
      const v = vec(1, 2, 3, 4);
      for (let i = 1; i <= 4; i++) mat.setRow(i, v);

      for (let i = 1; i <= 4; i++)
        for (let j = 1; j <= 4; j++)
          expect(mat.getAt(i, j)).toBe(j);
    });

    it('setCol fills columns correctly', () => {
      const v = vec(1, 2, 3, 4);
      for (let j = 1; j <= 4; j++) mat.setCol(j, v);

      for (let i = 1; i <= 4; i++)
        for (let j = 1; j <= 4; j++)
          expect(mat.getAt(i, j)).toBe(i);
    });

    it('row() returns correct row vector', () => {
      for (let i = 1; i <= 4; i++)
        for (let j = 1; j <= 4; j++)
          mat.setAt(i, j, j);

      const expected = vec(1, 2, 3, 4);
      for (let i = 1; i <= 4; i++)
        expect(expected.equals(mat.row(i))).toBe(true);
    });

    it('col() returns correct column vector', () => {
      for (let i = 1; i <= 4; i++)
        for (let j = 1; j <= 4; j++)
          mat.setAt(i, j, i);

      const expected = vec(1, 2, 3, 4);
      for (let j = 1; j <= 4; j++)
        expect(expected.equals(mat.col(j))).toBe(true);
    });

    it('setRow and row() round-trip correctly', () => {
      const v = vec(5, 10, 15, 20);
      mat.setRow(2, v);
      expect(v.equals(mat.row(2))).toBe(true);
    });

    it('setCol and col() round-trip correctly', () => {
      const v = vec(5, 10, 15, 20);
      mat.setCol(3, v);
      expect(v.equals(mat.col(3))).toBe(true);
    });
  });
});
