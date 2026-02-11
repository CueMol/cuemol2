import { cm } from '../setup';
import { RangeSet } from '@/wrappers/RangeSet';

/**
 * Helper: Create a RangeSet from integer ranges
 * @param ranges - Array of [start, end) tuples (half-open intervals)
 * @returns New RangeSet containing specified ranges
 */
const createRange = (...ranges: Array<[number, number]>): RangeSet => {
    let result = cm.createObj('RangeSet') as RangeSet;
    for (const [start, end] of ranges) {
        result = result.appendInt(start, end);
    }
    return result;
};

/**
 * Helper: Create a RangeSet from string representation
 * @param str - Range string like "1:9,20:29" or "5" (single element)
 * @returns New RangeSet parsed from string
 */
const fromString = (str: string): RangeSet => {
    const rs = cm.createObj('RangeSet') as RangeSet;
    rs.fromString(str);
    return rs;
};

describe('RangeSet', () => {

    describe('creation and initialization', () => {
        it('creates empty RangeSet by default', () => {
            const rs = cm.createObj('RangeSet') as RangeSet;

            expect(rs.isEmpty()).toBe(true);
            expect(rs.toString()).toBe('');
        });

        it('parses from string representation', () => {
            const rs = fromString('1:10,20:30');

            expect(rs.toString()).toBe('1:10,20:30');
            expect(rs.isEmpty()).toBe(false);
        });
    });

    describe('appendInt - adding ranges', () => {
        it('returns new RangeSet without modifying original (immutability)', () => {
            const original = cm.createObj('RangeSet') as RangeSet;
            const modified = original.appendInt(1, 10);

            expect(original.isEmpty()).toBe(true);
            expect(modified.toString()).toBe('1:9');
        });

        it('adds single range to empty set', () => {
            const rs = createRange([5, 10]);

            expect(rs.toString()).toBe('5:9');
        });

        it('maintains sorted order when adding non-overlapping ranges', () => {
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

        it('merges multiple overlapping and adjacent ranges', () => {
            const rs = createRange([1, 5], [3, 8], [7, 12], [15, 20]);

            expect(rs.toString()).toBe('1:11,15:19');
        });

        it('handles single-element range (size 1)', () => {
            const rs = createRange([5, 6]);

            expect(rs.toString()).toBe('5');
        });

        it('ignores empty range (start equals end)', () => {
            const rs = createRange([5, 5]);

            expect(rs.isEmpty()).toBe(true);
            expect(rs.toString()).toBe('');
        });

        it('handles negative ranges', () => {
            const rs = createRange([-10, -5], [0, 5]);

            expect(rs.toString()).toBe('-10:-6,0:4');
        });

        it('handles large range values', () => {
            const rs = createRange([1000000, 2000000]);

            expect(rs.toString()).toBe('1000000:1999999');
            expect(rs.containsInt(1500000, 1500100)).toBe(true);
        });
    });

    describe('append - merging RangeSets', () => {
        it('merges overlapping RangeSets', () => {
            const rs1 = createRange([1, 10]);
            const rs2 = createRange([5, 15]);
            const result = rs1.append(rs2);

            expect(result.toString()).toBe('1:14');
        });

        it('merges non-overlapping RangeSets in sorted order', () => {
            const rs1 = createRange([1, 10], [30, 40]);
            const rs2 = createRange([15, 25]);
            const result = rs1.append(rs2);

            expect(result.toString()).toBe('1:9,15:24,30:39');
        });

        it('handles appending empty RangeSet', () => {
            const rs1 = createRange([1, 10]);
            const rs2 = cm.createObj('RangeSet') as RangeSet;
            const result = rs1.append(rs2);

            expect(result.toString()).toBe('1:9');
        });

        it('handles appending to empty RangeSet', () => {
            const rs1 = cm.createObj('RangeSet') as RangeSet;
            const rs2 = createRange([1, 10]);
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

    describe('removeInt - removing ranges', () => {
        it('returns new RangeSet without modifying original (immutability)', () => {
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

            expect(rs.isEmpty()).toBe(true);
        });

        it('handles removal with no overlap', () => {
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

        it('ignores empty range removal', () => {
            const rs = createRange([1, 10]).removeInt(5, 5);

            expect(rs.toString()).toBe('1:9');
        });

        it('handles partial overlap at start', () => {
            const rs = createRange([10, 20]).removeInt(5, 15);

            expect(rs.toString()).toBe('15:19');
        });

        it('handles partial overlap at end', () => {
            const rs = createRange([10, 20]).removeInt(15, 25);

            expect(rs.toString()).toBe('10:14');
        });
    });

    describe('remove - removing RangeSets', () => {
        it('removes multiple ranges from another RangeSet', () => {
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
            const rs2 = cm.createObj('RangeSet') as RangeSet;
            const result = rs1.remove(rs2);

            expect(rs1.toString()).toBe('1:9');
        });

        it('removes all ranges when removing self', () => {
            const rs1 = createRange([1, 10], [20, 30]);
            const result = rs1.remove(rs1);

            expect(result.isEmpty()).toBe(true);
        });

        it('handles removing from empty RangeSet', () => {
            const empty = cm.createObj('RangeSet') as RangeSet;
            const rs2 = createRange([1, 10]);
            const result = empty.remove(rs2);

            expect(result.isEmpty()).toBe(true);
        });
    });

    describe('containsInt - range query', () => {
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

        it('handles boundary cases at range edges', () => {
            expect(rs.containsInt(1, 2)).toBe(true);   // Start boundary
            expect(rs.containsInt(9, 10)).toBe(true);  // End boundary
            expect(rs.containsInt(0, 1)).toBe(false);  // Before range
            expect(rs.containsInt(10, 11)).toBe(false); // After range
        });

        it('returns false for empty RangeSet', () => {
            const empty = cm.createObj('RangeSet') as RangeSet;

            expect(empty.containsInt(0, 10)).toBe(false);
        });

        it('handles single-element range check', () => {
            expect(rs.containsInt(5, 6)).toBe(true);
            expect(rs.containsInt(15, 16)).toBe(false);
        });

        it('handles zero-width range query (start equals end)', () => {
            expect(rs.containsInt(5, 5)).toBe(true);  // Zero-width query in range
            expect(rs.containsInt(15, 15)).toBe(false); // Zero-width query in gap
        });
    });

    describe('negate - complement operation', () => {
        it('produces complement with gaps filled', () => {
            const rs = createRange([10, 20], [30, 40]).negate();
            const str = rs.toString();

            // Gap between 20 and 30 should be filled in complement
            expect(str).toContain('20:29');
        });

        it('produces full range when negating empty set', () => {
            const rs = (cm.createObj('RangeSet') as RangeSet).negate();

            // Full complement extends to integer bounds
            expect(rs.toString().length).toBeGreaterThan(0);
        });

        it('produces empty set when negating full range', () => {
            const fullRange = (cm.createObj('RangeSet') as RangeSet).negate();
            const empty = fullRange.negate();

            expect(empty.isEmpty()).toBe(true);
        });

        it('double negation recovers original range', () => {
            const original = createRange([10, 20], [30, 40]);
            const doubleNegated = original.negate().negate();

            expect(doubleNegated.toString()).toBe(original.toString());
        });

        it('handles single range negation structure', () => {
            const rs = createRange([10, 20]).negate();
            const str = rs.toString();

            // Should have ranges before and after [10,20)
            expect(str.split(',').length).toBeGreaterThan(1);
            expect(str).toContain('20:');
        });
    });

    describe('toString and fromString - serialization', () => {
        it('converts empty set to empty string', () => {
            const rs = cm.createObj('RangeSet') as RangeSet;

            expect(rs.toString()).toBe('');
        });

        it('formats single range with colon notation', () => {
            const rs = createRange([5, 10]);

            expect(rs.toString()).toBe('5:9');
        });

        it('formats single-element range without colon', () => {
            const rs = createRange([5, 6]);

            expect(rs.toString()).toBe('5');
        });

        it('formats multiple ranges with comma separator', () => {
            const rs = createRange([1, 5], [10, 15], [20, 25]);

            expect(rs.toString()).toBe('1:4,10:14,20:24');
        });

        it('parses single range from string', () => {
            const rs = fromString('5:10');

            expect(rs.toString()).toBe('5:10');
            expect(rs.containsInt(5, 11)).toBe(true);
        });

        it('parses single element from string', () => {
            const rs = fromString('5');

            expect(rs.toString()).toBe('5');
            expect(rs.containsInt(5, 6)).toBe(true);
        });

        it('parses multiple ranges from string', () => {
            const rs = fromString('1:10,20:30,40:50');

            expect(rs.toString()).toBe('1:10,20:30,40:50');
        });

        it('round-trips through string conversion', () => {
            const original = '1:10,20:30,40:50,100:200';
            const rs = fromString(original);

            expect(rs.toString()).toBe(original);
        });

        it('handles negative ranges in string format', () => {
            const rs = fromString('-10:-5,0:5');

            expect(rs.toString()).toBe('-10:-5,0:5');
            expect(rs.containsInt(-8, -6)).toBe(true);
        });
    });

    describe('clear and isEmpty - state management', () => {
        it('isEmpty returns true for new RangeSet', () => {
            const rs = cm.createObj('RangeSet') as RangeSet;

            expect(rs.isEmpty()).toBe(true);
        });

        it('isEmpty returns false after adding ranges', () => {
            const rs = createRange([1, 10]);

            expect(rs.isEmpty()).toBe(false);
        });

        it('clear removes all ranges', () => {
            const rs = fromString('1:10,20:30,40:50');
            rs.clear();

            expect(rs.isEmpty()).toBe(true);
            expect(rs.toString()).toBe('');
        });

        it('clear makes RangeSet reusable', () => {
            const rs = fromString('1:10');
            rs.clear();
            rs.fromString('20:30');

            expect(rs.toString()).toBe('20:30');
        });

        it('operations on empty set return empty set', () => {
            const empty = cm.createObj('RangeSet') as RangeSet;
            const result = empty.removeInt(1, 10);

            expect(result.isEmpty()).toBe(true);
        });
    });

    describe('complex scenarios and edge cases', () => {
        it('builds swiss cheese pattern through sequential removals', () => {
            let rs = createRange([0, 100]);
            rs = rs.removeInt(10, 20);
            rs = rs.removeInt(30, 40);
            rs = rs.removeInt(50, 60);
            rs = rs.removeInt(70, 80);

            expect(rs.toString()).toBe('0:9,20:29,40:49,60:69,80:99');
        });

        it('handles interleaved append and remove operations', () => {
            let rs = cm.createObj('RangeSet') as RangeSet;
            rs = rs.appendInt(1, 100);
            rs = rs.removeInt(25, 75);
            rs = rs.appendInt(40, 60);
            rs = rs.removeInt(45, 55);

            expect(rs.toString()).toBe('1:24,40:44,55:59,75:99');
        });

        it('handles complex merging with overlapping operations', () => {
            let rs = createRange([1, 20]);
            rs = rs.appendInt(15, 35);
            rs = rs.removeInt(10, 25);
            rs = rs.appendInt(22, 40);

            expect(rs.toString()).toBe('1:9,22:39');
        });

        it('handles ranges that touch at boundaries', () => {
            const rs = createRange([1, 10], [10, 20], [20, 30]);

            expect(rs.toString()).toBe('1:29');
        });

        it('combines with empty sets in all operations', () => {
            const rs = createRange([1, 10]);
            const empty = cm.createObj('RangeSet') as RangeSet;

            expect(rs.append(empty).toString()).toBe('1:9');
            expect(empty.append(rs).toString()).toBe('1:9');
            expect(rs.remove(empty).toString()).toBe('1:9');
            expect(empty.remove(rs).toString()).toBe('');
        });

        it('handles very large numbers of ranges', () => {
            const ranges: Array<[number, number]> = [];
            for (let i = 0; i < 100; i++) {
                ranges.push([i * 10, i * 10 + 5]);
            }
            const rs = createRange(...ranges);

            expect(rs.toString().split(',').length).toBe(100);
        });

        it('handles alternating append/remove creating complex pattern', () => {
            let rs = cm.createObj('RangeSet') as RangeSet;
            for (let i = 0; i < 10; i++) {
                rs = rs.appendInt(i * 20, i * 20 + 10);
            }
            for (let i = 0; i < 10; i += 2) {
                rs = rs.removeInt(i * 20 + 2, i * 20 + 8);
            }

            // Should have modified ranges at even positions
            const parts = rs.toString().split(',');
            expect(parts.length).toBeGreaterThan(10);
        });
    });
});
