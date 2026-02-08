import { cm } from './setup.js';

/**
 * Helper: Create a RangeSet with specified integer ranges
 * @param {...[number, number]} ranges - Array of [start, end) tuples
 * @returns {object} RangeSet object
 */
const createRange = (...ranges) => {
  let result = cm.createObj('RangeSet');
  for (const [start, end] of ranges) {
    result = result.appendInt(start, end);
  }
  return result;
};

/**
 * Helper: Create a RangeSet from string representation
 * @param {string} str - Range string like "1:9,20:29"
 * @returns {object} RangeSet object
 */
const rangeFromString = (str) => {
  const rs = cm.createObj('RangeSet');
  rs.fromString(str);
  return rs;
};

describe('RangeSet', () => {
  describe('creation and initialization', () => {
    it('creates empty RangeSet by default', () => {
      const rs = cm.createObj('RangeSet');

      expect(rs.isEmpty()).toBe(true);
      expect(rs.toString()).toBe('');
    });

    it('creates RangeSet from string', () => {
      const rs = rangeFromString('1:10,20:30');

      expect(rs.toString()).toBe('1:10,20:30');
      expect(rs.isEmpty()).toBe(false);
    });
  });

  describe('appendInt', () => {
    it('returns new RangeSet without modifying original', () => {
      const original = cm.createObj('RangeSet');
      const modified = original.appendInt(1, 10);

      expect(original.toString()).toBe('');
      expect(modified.toString()).toBe('1:9');
    });

    it('adds single range to empty set', () => {
      const rs = createRange([5, 10]);

      expect(rs.toString()).toBe('5:9');
    });

    it('maintains sorted order with non-overlapping ranges', () => {
      const rs = createRange([20, 30], [1, 10], [100, 110]);

      expect(rs.toString()).toBe('1:9,20:29,100:109');
    });

    it('merges overlapping ranges', () => {
      const rs = createRange([1, 10], [5, 15]);

      expect(rs.toString()).toBe('1:14');
    });

    it('merges adjacent ranges', () => {
      const rs = createRange([1, 10], [10, 20]);

      expect(rs.toString()).toBe('1:19');
    });

    it('merges multiple overlapping ranges', () => {
      const rs = createRange([1, 5], [3, 8], [7, 12], [15, 20]);

      expect(rs.toString()).toBe('1:11,15:19');
    });

    it('handles single-element range', () => {
      const rs = createRange([5, 6]);

      expect(rs.toString()).toBe('5:6');
    });
  });

  describe('append', () => {
    it('merges another RangeSet', () => {
      const rs1 = createRange([1, 10]);
      const rs2 = createRange([5, 15]);
      const result = rs1.append(rs2);

      expect(result.toString()).toBe('1:14');
    });

    it('merges non-overlapping ranges from another RangeSet', () => {
      const rs1 = createRange([1, 10], [30, 40]);
      const rs2 = createRange([15, 25]);
      const result = rs1.append(rs2);

      expect(result.toString()).toBe('1:9,15:24,30:39');
    });

    it('handles empty RangeSet', () => {
      const rs1 = createRange([1, 10]);
      const rs2 = cm.createObj('RangeSet');
      const result = rs1.append(rs2);

      expect(result.toString()).toBe('1:9');
    });

    it('bridges gap between ranges', () => {
      const rs1 = createRange([1, 10], [20, 30]);
      const rs2 = createRange([8, 22]);
      const result = rs1.append(rs2);

      expect(result.toString()).toBe('1:29');
    });
  });

  describe('removeInt', () => {
    it('returns new RangeSet without modifying original', () => {
      const original = createRange([1, 10]);
      const modified = original.removeInt(5, 8);

      expect(original.toString()).toBe('1:9');
      expect(modified.toString()).toBe('1:4,8:9');
    });

    it('splits range when removing from middle', () => {
      const rs = createRange([1, 10]).removeInt(4, 7);

      expect(rs.toString()).toBe('1:3,7:9');
    });

    it('removes from start of range', () => {
      const rs = createRange([1, 10]).removeInt(1, 5);

      expect(rs.toString()).toBe('5:9');
    });

    it('removes from end of range', () => {
      const rs = createRange([1, 10]).removeInt(5, 10);

      expect(rs.toString()).toBe('1:4');
    });

    it('removes entire range', () => {
      const rs = createRange([1, 10]).removeInt(1, 10);

      expect(rs.toString()).toBe('');
      expect(rs.isEmpty()).toBe(true);
    });

    it('removes nothing when ranges do not overlap', () => {
      const rs = createRange([1, 10]).removeInt(20, 30);

      expect(rs.toString()).toBe('1:9');
    });

    it('removes across multiple ranges', () => {
      const rs = createRange([1, 10], [20, 30], [40, 50]).removeInt(5, 45);

      expect(rs.toString()).toBe('1:4,45:49');
    });

    it('handles exact boundary removal', () => {
      const rs = createRange([1, 10], [20, 30]).removeInt(10, 20);

      expect(rs.toString()).toBe('1:9,20:29');
    });
  });

  describe('remove', () => {
    it('removes ranges from another RangeSet', () => {
      const rs1 = createRange([1, 100]);
      const rs2 = createRange([10, 20], [30, 40], [50, 60]);
      const result = rs1.remove(rs2);

      expect(result.toString()).toBe('1:9,20:29,40:49,60:99');
    });

    it('handles overlapping removals', () => {
      const rs1 = createRange([1, 50], [60, 100]);
      const rs2 = createRange([40, 70]);
      const result = rs1.remove(rs2);

      expect(result.toString()).toBe('1:39,70:99');
    });

    it('handles removing empty RangeSet', () => {
      const rs1 = createRange([1, 10]);
      const rs2 = cm.createObj('RangeSet');
      const result = rs1.remove(rs2);

      expect(result.toString()).toBe('1:9');
    });

    it('can remove all ranges', () => {
      const rs1 = createRange([1, 10], [20, 30]);
      const result = rs1.remove(rs1);

      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('negate', () => {
    it('produces complement of single range', () => {
      const rs = createRange([10, 20]).negate();

      // Negate produces complement - should have ranges before and after
      const str = rs.toString();
      expect(str).toContain('20:');
      expect(str.split(',').length).toBeGreaterThan(1);
    });

    it('produces full range when negating empty set', () => {
      const rs = cm.createObj('RangeSet').negate();

      // Full complement of empty set
      const str = rs.toString();
      expect(str.length).toBeGreaterThan(0);
      expect(str).toContain(':');
    });

    it('produces empty set when negating full range', () => {
      const fullRange = cm.createObj('RangeSet').negate();
      const empty = fullRange.negate();

      expect(empty.isEmpty()).toBe(true);
    });

    it('produces gaps between ranges', () => {
      const rs = createRange([10, 20], [30, 40]).negate();

      // Should have gap between 20 and 30 filled in complement
      const str = rs.toString();
      expect(str).toContain('20:29');
    });

    it('double negation recovers original range', () => {
      const original = createRange([10, 20], [30, 40]);
      const doubleNegated = original.negate().negate();

      expect(doubleNegated.toString()).toBe(original.toString());
    });
  });

  describe('containsInt', () => {
    const rs = createRange([1, 10], [20, 30], [40, 50]);

    it('returns true when range is fully contained', () => {
      expect(rs.containsInt(2, 5)).toBe(true);
      expect(rs.containsInt(1, 10)).toBe(true);
      expect(rs.containsInt(22, 28)).toBe(true);
    });

    it('returns false when range partially overlaps', () => {
      expect(rs.containsInt(5, 15)).toBe(false);
      expect(rs.containsInt(25, 35)).toBe(false);
    });

    it('returns false when range does not overlap', () => {
      expect(rs.containsInt(11, 19)).toBe(false);
      expect(rs.containsInt(100, 200)).toBe(false);
    });

    it('handles boundary cases', () => {
      expect(rs.containsInt(1, 2)).toBe(true);
      expect(rs.containsInt(9, 10)).toBe(true);
      expect(rs.containsInt(0, 1)).toBe(false);
      expect(rs.containsInt(10, 11)).toBe(false);
    });

    it('returns false for empty RangeSet', () => {
      const empty = cm.createObj('RangeSet');

      expect(empty.containsInt(0, 10)).toBe(false);
    });

    it('handles single-element range check', () => {
      expect(rs.containsInt(5, 6)).toBe(true);
      expect(rs.containsInt(15, 16)).toBe(false);
    });
  });

  describe('toString and fromString', () => {
    it('converts empty set to empty string', () => {
      const rs = cm.createObj('RangeSet');

      expect(rs.toString()).toBe('');
    });

    it('formats single range correctly', () => {
      const rs = createRange([5, 10]);

      expect(rs.toString()).toBe('5:9');
    });

    it('formats multiple ranges with comma separator', () => {
      const rs = createRange([1, 5], [10, 15], [20, 25]);

      expect(rs.toString()).toBe('1:4,10:14,20:24');
    });

    it('parses single range from string', () => {
      const rs = rangeFromString('5:10');

      expect(rs.toString()).toBe('5:10');
      expect(rs.containsInt(5, 11)).toBe(true);
    });

    it('parses multiple ranges from string', () => {
      const rs = rangeFromString('1:10,20:30,40:50');

      expect(rs.toString()).toBe('1:10,20:30,40:50');
    });

    it('round-trips through string conversion', () => {
      const original = '1:10,20:30,40:50,100:200';
      const rs = rangeFromString(original);

      expect(rs.toString()).toBe(original);
    });

    it('can query parsed ranges', () => {
      const rs = rangeFromString('1:10,50:100');

      expect(rs.containsInt(5, 8)).toBe(true);
      expect(rs.containsInt(60, 80)).toBe(true);
      expect(rs.containsInt(20, 30)).toBe(false);
    });
  });

  describe('clear and isEmpty', () => {
    it('isEmpty returns true for new RangeSet', () => {
      const rs = cm.createObj('RangeSet');

      expect(rs.isEmpty()).toBe(true);
    });

    it('isEmpty returns false after adding ranges', () => {
      const rs = createRange([1, 10]);

      expect(rs.isEmpty()).toBe(false);
    });

    it('clear removes all ranges', () => {
      const rs = rangeFromString('1:10,20:30,40:50');
      rs.clear();

      expect(rs.isEmpty()).toBe(true);
      expect(rs.toString()).toBe('');
    });

    it('clear makes RangeSet reusable', () => {
      const rs = rangeFromString('1:10');
      rs.clear();
      rs.fromString('20:30');

      expect(rs.toString()).toBe('20:30');
    });

    it('operations on empty set return empty set', () => {
      const empty = cm.createObj('RangeSet');
      const result = empty.removeInt(1, 10);

      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('complex scenarios', () => {
    it('builds swiss cheese pattern through removals', () => {
      let rs = createRange([0, 100]);
      rs = rs.removeInt(10, 20);
      rs = rs.removeInt(30, 40);
      rs = rs.removeInt(50, 60);
      rs = rs.removeInt(70, 80);

      expect(rs.toString()).toBe('0:9,20:29,40:49,60:69,80:99');
    });

    it('merges overlapping operations in correct order', () => {
      let rs = createRange([1, 20]);
      rs = rs.appendInt(15, 35);
      rs = rs.removeInt(10, 25);
      rs = rs.appendInt(22, 40);

      expect(rs.toString()).toBe('1:9,22:39');
    });

    it('handles interleaved append and remove', () => {
      let rs = cm.createObj('RangeSet');
      rs = rs.appendInt(1, 100);
      rs = rs.removeInt(25, 75);
      rs = rs.appendInt(40, 60);
      rs = rs.removeInt(45, 55);

      expect(rs.toString()).toBe('1:24,40:44,55:59,75:99');
    });

    it('combines with empty sets correctly', () => {
      const rs1 = createRange([1, 10]);
      const empty = cm.createObj('RangeSet');

      expect(rs1.append(empty).toString()).toBe('1:9');
      expect(empty.append(rs1).toString()).toBe('1:9');
      expect(rs1.remove(empty).toString()).toBe('1:9');
    });

    it('handles ranges that touch at boundaries', () => {
      const rs = createRange([1, 10], [10, 20], [20, 30]);

      expect(rs.toString()).toBe('1:29');
    });
  });

  describe('edge cases', () => {
    it('handles empty range (start equals end)', () => {
      const rs = createRange([5, 5]);

      // Empty ranges should be silently ignored
      expect(rs.toString()).toBe('');
      expect(rs.isEmpty()).toBe(true);
    });

    it('contains check with equal start and end', () => {
      const rs = createRange([1, 10]);

      // Zero-width range check should work
      expect(rs.containsInt(5, 5)).toBe(true);
    });

    it('handles large range values', () => {
      const rs = createRange([1, 1000000]);

      expect(rs.containsInt(500000, 500100)).toBe(true);
      expect(rs.toString()).toBe('1:999999');
    });
  });
});
