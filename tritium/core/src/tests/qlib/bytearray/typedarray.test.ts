import { cm } from '../../setup';
import type { ByteArray } from '@/wrappers/ByteArray';

// ============================================================================
// Shared test helpers and constants
// ============================================================================

/**
 * Check if value is a TypedArray of expected type
 * Uses constructor.name to avoid cross-realm issues with instanceof
 */
export const expectTypedArrayType = (
    value: any,
    expectedType: string,
    bytesPerElement: number
) => {
    expect(value.constructor.name).toBe(expectedType);
    expect(value).toHaveProperty('buffer');
    expect(value).toHaveProperty('byteLength');
    expect(value).toHaveProperty('byteOffset');
    expect(typeof value.length).toBe('number');
    expect(value.BYTES_PER_ELEMENT).toBe(bytesPerElement);
};

/**
 * Type mapping configurations for ByteArray element types
 */
export const TYPE_MAPPINGS = [
    { baType: 'FLOAT32', arrayType: 'Float32Array', bytesPerElement: 4 },
    { baType: 'FLOAT64', arrayType: 'Float64Array', bytesPerElement: 8 },
    { baType: 'UINT8', arrayType: 'Uint8Array', bytesPerElement: 1 },
    { baType: 'INT8', arrayType: 'Int8Array', bytesPerElement: 1 },
    { baType: 'UINT16', arrayType: 'Uint16Array', bytesPerElement: 2 },
    { baType: 'INT16', arrayType: 'Int16Array', bytesPerElement: 2 },
    { baType: 'UINT32', arrayType: 'Uint32Array', bytesPerElement: 4 },
    { baType: 'INT32', arrayType: 'Int32Array', bytesPerElement: 4 },
] as const;

/**
 * Get TypedArray constructor by name
 */
export const getTypedArrayConstructor = (typeName: string): any => {
    const constructors: Record<string, any> = {
        Float32Array,
        Float64Array,
        Uint8Array,
        Int8Array,
        Uint16Array,
        Int16Array,
        Uint32Array,
        Int32Array,
        Uint8ClampedArray,
    };
    return constructors[typeName];
};

// ============================================================================
// copyToTypedArray tests - ByteArray to TypedArray with data copy
// ============================================================================

describe('copyToTypedArray', () => {
    let ba: ByteArray;

    beforeEach(() => {
        ba = cm.createObj('ByteArray') as ByteArray;
    });

    it.each(TYPE_MAPPINGS)(
        'creates $arrayType from $baType ByteArray',
        ({ baType, arrayType, bytesPerElement }) => {
            const elemCount = 10;
            ba.init((ba as any)[baType], elemCount);
            
            const arr = cm.copyToTypedArray(ba);
            
            expectTypedArrayType(arr, arrayType, bytesPerElement);
            expect(arr.length).toBe(elemCount);
            expect(ba.elemType).toBe((ba as any)[baType]);
            expect(ba.elemCount).toBe(elemCount);
        }
    );

    it('copies data correctly for Float32', () => {
        ba.init(ba.FLOAT32, 5);
        for (let i = 0; i < 5; i++) {
            ba.setAtF(i, i * 1.5);
        }

        const arr = cm.copyToTypedArray(ba) as Float32Array;

        for (let i = 0; i < 5; i++) {
            expect(arr[i]).toBeCloseTo(i * 1.5, 5);
        }
    });

    it('creates independent copy (not shared memory)', () => {
        ba.init(ba.UINT32, 3);
        ba.setAt(0, 100);
        ba.setAt(1, 200);

        const arr = cm.copyToTypedArray(ba) as Uint32Array;
        
        // Modify ByteArray
        ba.setAt(0, 999);

        // TypedArray should retain original value
        expect(arr[0]).toBe(100);
        expect(ba.getAt(0)).toBe(999);
    });

    it('handles empty ByteArray', () => {
        ba.init(ba.FLOAT32, 0);
        const arr = cm.copyToTypedArray(ba);
        
        expect(arr.length).toBe(0);
        expect(ba.elemCount).toBe(0);
    });
});

// ============================================================================
// copyFromTypedArray tests - TypedArray to ByteArray with data copy
// ============================================================================

describe('copyFromTypedArray', () => {
    it.each(TYPE_MAPPINGS)(
        'creates ByteArray from $arrayType',
        ({ baType, arrayType, bytesPerElement }) => {
            const Constructor = getTypedArrayConstructor(arrayType);
            const srcData = new Constructor(5);
            
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;
            
            expect(ba.elemType).toBe((ba as any)[baType]);
            expect(ba.elemCount).toBe(5);
            expect(ba.length).toBe(5 * bytesPerElement);
        }
    );

    describe('data copy validation', () => {
        it('copies integer data correctly', () => {
            const srcData = new Uint16Array([1000, 2000, 3000]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.UINT16);
            expect(ba.elemCount).toBe(3);
            expect(ba.getAt(0)).toBe(1000);
            expect(ba.getAt(1)).toBe(2000);
            expect(ba.getAt(2)).toBe(3000);
        });

        it('copies floating point data correctly', () => {
            const srcData = new Float32Array([1.5, 2.5, 3.5]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.FLOAT32);
            expect(ba.elemCount).toBe(3);
            expect(ba.getAtF(0)).toBeCloseTo(1.5, 5);
            expect(ba.getAtF(1)).toBeCloseTo(2.5, 5);
            expect(ba.getAtF(2)).toBeCloseTo(3.5, 5);
        });

        it('creates independent copy (not shared memory)', () => {
            const srcData = new Uint8Array([10, 20, 30]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            // Modify source
            srcData[0] = 99;

            // ByteArray should have original value
            expect(ba.getValue(0)).toBe(10);
        });
    });

    describe('special array types', () => {
        it('handles Uint8ClampedArray', () => {
            const srcData = new Uint8ClampedArray([0, 128, 255]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.UINT8);
            expect(ba.elemCount).toBe(3);
            expect(ba.getValue(0)).toBe(0);
            expect(ba.getValue(1)).toBe(128);
            expect(ba.getValue(2)).toBe(255);
        });

        it('handles TypedArray with byte offset', () => {
            const buffer = new ArrayBuffer(20);
            const fullView = new Uint8Array(buffer);
            fullView.set([1, 2, 3, 4, 5, 6, 7, 8]);

            // Create view starting at byte offset 4
            const offsetView = new Uint8Array(buffer, 4, 4);
            const ba = cm.copyFromTypedArray(offsetView) as ByteArray;

            expect(ba.elemCount).toBe(4);
            expect(ba.getValue(0)).toBe(5);
            expect(ba.getValue(1)).toBe(6);
        });
    });

    describe('edge cases', () => {
        it('handles empty TypedArray', () => {
            const srcData = new Float32Array(0);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.elemCount).toBe(0);
            expect(ba.length).toBe(0);
        });

        it('handles large TypedArray', () => {
            const size = 10000;
            const srcData = new Uint32Array(size);
            for (let i = 0; i < size; i++) {
                srcData[i] = i;
            }

            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.elemCount).toBe(size);
            expect(ba.getAt(0)).toBe(0);
            expect(ba.getAt(size - 1)).toBe(size - 1);
        });
    });

    describe('error handling', () => {
        it('throws error for non-TypedArray input', () => {
            expect(() => cm.copyFromTypedArray([1, 2, 3])).toThrow();
            expect(() => cm.copyFromTypedArray('invalid')).toThrow();
            expect(() => cm.copyFromTypedArray({})).toThrow();
        });

        it('throws error for missing argument', () => {
            expect(() => (cm.copyFromTypedArray as any)()).toThrow();
        });
    });
});
