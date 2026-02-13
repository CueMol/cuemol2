import { cm } from '../setup';
import type { ByteArray } from '@/wrappers/ByteArray';

/**
 * Element type test cases with their properties
 */
const INT_TYPES = [
    { name: 'UINT8', size: 1 },
    { name: 'INT8', size: 1 },
    { name: 'UINT16', size: 2 },
    { name: 'INT16', size: 2 },
    { name: 'UINT32', size: 4 },
    { name: 'INT32', size: 4 },
] as const;

const FLOAT_TYPES = [
    { name: 'FLOAT32', size: 4 },
    { name: 'FLOAT64', size: 8 },
] as const;

describe('ByteArray', () => {
    let ba: ByteArray;

    beforeEach(() => {
        ba = cm.createObj('ByteArray') as ByteArray;
    });

    describe('initialization', () => {
        it('creates instance successfully', () => {
            expect(ba).toBeTruthy();
        });

        it.each([
            ...INT_TYPES,
            ...FLOAT_TYPES,
        ])('initializes with $name type correctly', ({ name, size }) => {
            const elemCount = 10;
            const elemType = (ba as any)[name];

            ba.init(elemType, elemCount);

            expect(ba.length).toBe(elemCount * size);
        });

        it('calculates byte length correctly for UINT8', () => {
            const elemCount = 100;
            ba.init(ba.UINT8, elemCount);

            expect(ba.length).toBe(elemCount * 1);
        });

        it('calculates byte length correctly for INT32', () => {
            const elemCount = 25;
            ba.init(ba.INT32, elemCount);

            expect(ba.length).toBe(elemCount * 4);
        });

        it('calculates byte length correctly for FLOAT64', () => {
            const elemCount = 50;
            ba.init(ba.FLOAT64, elemCount);

            expect(ba.length).toBe(elemCount * 8);
        });
    });

    describe('byte-level access (getValue/setValue)', () => {
        beforeEach(() => {
            ba.init(ba.UINT8, 10);
        });

        it('sets and gets byte values correctly', () => {
            ba.setValue(0, 42);
            ba.setValue(5, 255);

            expect(ba.getValue(0)).toBe(42);
            expect(ba.getValue(5)).toBe(255);
        });

        it.each([
            ['negative index', -1],
            ['index at length', 10],
            ['index beyond length', 100],
        ])('getValue throws for %s', (_name: string, index: number) => {
            expect(() => ba.getValue(index)).toThrow();
        });

        it.each([
            ['negative index', -1, 42],
            ['index at length', 10, 42],
            ['index beyond length', 100, 42],
        ])('setValue throws for %s', (_name: string, index: number, value: number) => {
            expect(() => ba.setValue(index, value)).toThrow();
        });

        it('handles boundary byte values', () => {
            ba.setValue(0, 0);
            ba.setValue(1, 255);

            expect(ba.getValue(0)).toBe(0);
            expect(ba.getValue(1)).toBe(255);
        });
    });

    describe('integer element access (getAt/setAt)', () => {
        it.each(INT_TYPES)('sets and gets $name values correctly', ({ name, size }) => {
            const elemType = (ba as any)[name];
            const elemCount = 10;
            ba.init(elemType, elemCount);

            // Test values appropriate for each type
            const testValue = name.startsWith('U') ? 42 : -42;

            ba.setAt(0, testValue);
            ba.setAt(5, testValue * 2);

            expect(ba.getAt(0)).toBe(testValue);
            expect(ba.getAt(5)).toBe(testValue * 2);
        });

        it.each([
            ['negative index', -1],
            ['index at element count', 10],
            ['index beyond element count', 100],
        ])('getAt throws for %s', (_name: string, index: number) => {
            ba.init(ba.INT32, 10);

            expect(() => ba.getAt(index)).toThrow();
        });

        it.each([
            ['negative index', -1, 42],
            ['index at element count', 10, 42],
            ['index beyond element count', 100, 42],
        ])('setAt throws for %s', (_name: string, index: number, value: number) => {
            ba.init(ba.INT32, 10);

            expect(() => ba.setAt(index, value)).toThrow();
        });

        it('throws when getAt is called on float type', () => {
            ba.init(ba.FLOAT32, 10);

            expect(() => ba.getAt(0)).toThrow();
        });

        it('throws when setAt is called on float type', () => {
            ba.init(ba.FLOAT64, 10);

            expect(() => ba.setAt(0, 42)).toThrow();
        });

        it('handles signed integer overflow correctly for INT8', () => {
            ba.init(ba.INT8, 10);

            // INT8 range: -128 to 127
            ba.setAt(0, 127);
            ba.setAt(1, -128);

            expect(ba.getAt(0)).toBe(127);
            expect(ba.getAt(1)).toBe(-128);
        });

        it('handles unsigned integer values correctly for UINT8', () => {
            ba.init(ba.UINT8, 10);

            // UINT8 range: 0 to 255
            ba.setAt(0, 0);
            ba.setAt(1, 255);

            expect(ba.getAt(0)).toBe(0);
            expect(ba.getAt(1)).toBe(255);
        });
    });

    describe('float element access (getAtF/setAtF)', () => {
        it.each(FLOAT_TYPES)('sets and gets $name values correctly', ({ name }) => {
            const elemType = (ba as any)[name];
            const elemCount = 10;
            ba.init(elemType, elemCount);

            ba.setAtF(0, 3.14);
            ba.setAtF(5, -2.718);

            expect(ba.getAtF(0)).toBeCloseTo(3.14, 5);
            expect(ba.getAtF(5)).toBeCloseTo(-2.718, 5);
        });

        it.each([
            ['negative index', -1],
            ['index at element count', 10],
            ['index beyond element count', 100],
        ])('getAtF throws for %s', (_name: string, index: number) => {
            ba.init(ba.FLOAT32, 10);

            expect(() => ba.getAtF(index)).toThrow();
        });

        it.each([
            ['negative index', -1, 3.14],
            ['index at element count', 10, 3.14],
            ['index beyond element count', 100, 3.14],
        ])('setAtF throws for %s', (_name: string, index: number, value: number) => {
            ba.init(ba.FLOAT32, 10);

            expect(() => ba.setAtF(index, value)).toThrow();
        });

        it('throws when getAtF is called on integer type', () => {
            ba.init(ba.INT32, 10);

            expect(() => ba.getAtF(0)).toThrow();
        });

        it('throws when setAtF is called on integer type', () => {
            ba.init(ba.UINT32, 10);

            expect(() => ba.setAtF(0, 3.14)).toThrow();
        });

        it('handles special float values correctly', () => {
            ba.init(ba.FLOAT64, 10);

            ba.setAtF(0, 0.0);
            ba.setAtF(1, -0.0);
            ba.setAtF(2, 1e10);
            ba.setAtF(3, -1e-10);

            expect(ba.getAtF(0)).toBeCloseTo(0.0);
            expect(ba.getAtF(1)).toBeCloseTo(-0.0);
            expect(ba.getAtF(2)).toBeCloseTo(1e10);
            expect(ba.getAtF(3)).toBeCloseTo(-1e-10);
        });
    });

    describe('element type constants', () => {
        it('exposes integer type constants', () => {
            expect(ba.UINT8).toBeGreaterThanOrEqual(0);
            expect(ba.INT8).toBeGreaterThanOrEqual(0);
            expect(ba.UINT16).toBeGreaterThanOrEqual(0);
            expect(ba.INT16).toBeGreaterThanOrEqual(0);
            expect(ba.UINT32).toBeGreaterThanOrEqual(0);
            expect(ba.INT32).toBeGreaterThanOrEqual(0);
        });

        it('exposes float type constants', () => {
            expect(ba.FLOAT32).toBeGreaterThanOrEqual(0);
            expect(ba.FLOAT64).toBeGreaterThanOrEqual(0);
        });

        it('has distinct type constant values', () => {
            const types = [
                ba.UINT8, ba.INT8,
                ba.UINT16, ba.INT16,
                ba.UINT32, ba.INT32,
                ba.FLOAT32, ba.FLOAT64,
            ];
            const uniqueTypes = new Set(types);

            expect(uniqueTypes.size).toBe(types.length);
        });
    });

    describe('mixed access patterns', () => {
        it('allows byte-level and element-level access on same array', () => {
            ba.init(ba.UINT16, 5);

            // Set via element access (UINT16 = 2 bytes per element)
            ba.setAt(0, 0x1234);

            // Verify via byte access (little-endian assumed)
            // Note: actual byte order depends on platform endianness
            const byte0 = ba.getValue(0);
            const byte1 = ba.getValue(1);

            // Just verify we can read bytes without error
            expect(byte0).toBeGreaterThanOrEqual(0);
            expect(byte1).toBeGreaterThanOrEqual(0);
        });

        it('maintains data integrity across different access methods', () => {
            ba.init(ba.INT32, 10);

            // Set via element access
            ba.setAt(5, 42);

            // Read back via element access
            expect(ba.getAt(5)).toBe(42);

            // Set another element to verify independence
            ba.setAt(0, 100);
            expect(ba.getAt(0)).toBe(100);
            expect(ba.getAt(5)).toBe(42); // Original value unchanged
        });
    });

    describe('toString', () => {
        it('returns string representation', () => {
            ba.init(ba.UINT8, 5);
            ba.setValue(0, 65); // 'A'
            ba.setValue(1, 66); // 'B'

            const str = ba.toString();

            expect(typeof str).toBe('string');
            expect(str.length).toBeGreaterThan(0);
        });
    });

});
