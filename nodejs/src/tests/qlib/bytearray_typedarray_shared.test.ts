import { cm } from '../setup';
import type { ByteArray } from '@/wrappers/ByteArray';

/**
 * Test suite for ByteArray to TypedArray zero-copy conversion
 * 
 * Tests the toTypedArray function which creates TypedArrays that share
 * memory with ByteArray objects.
 */

/**
 * Helper: Check if value is a TypedArray of expected type
 * Uses constructor.name instead of instanceof to avoid realm issues
 */
const expectTypedArrayType = (value: any, expectedType: string, bytesPerElement: number) => {
    expect(value.constructor.name).toBe(expectedType);
    expect(value).toHaveProperty('buffer');
    expect(value).toHaveProperty('byteLength');
    expect(value).toHaveProperty('byteOffset');
    expect(typeof value.length).toBe('number');
    expect(value.BYTES_PER_ELEMENT).toBe(bytesPerElement);
};

/**
 * Type mapping test cases
 */
const TYPE_MAPPINGS = [
    { baType: 'FLOAT32', arrayType: 'Float32Array', bytesPerElement: 4 },
    { baType: 'FLOAT64', arrayType: 'Float64Array', bytesPerElement: 8 },
    { baType: 'UINT8', arrayType: 'Uint8Array', bytesPerElement: 1 },
    { baType: 'INT8', arrayType: 'Int8Array', bytesPerElement: 1 },
    { baType: 'UINT16', arrayType: 'Uint16Array', bytesPerElement: 2 },
    { baType: 'INT16', arrayType: 'Int16Array', bytesPerElement: 2 },
    { baType: 'UINT32', arrayType: 'Uint32Array', bytesPerElement: 4 },
    { baType: 'INT32', arrayType: 'Int32Array', bytesPerElement: 4 },
] as const;

describe('ByteArray.toTypedArray (zero-copy)', () => {
    let ba: ByteArray;

    beforeEach(() => {
        ba = cm.createObj('ByteArray') as ByteArray;
    });

    describe('type mapping', () => {
        it.each(TYPE_MAPPINGS)(
            'creates $arrayType for $baType ByteArray',
            ({ baType, arrayType, bytesPerElement }) => {
                const elemCount = 10;
                ba.init((ba as any)[baType], elemCount);
                const typedArray = cm.toTypedArray(ba);

                expectTypedArrayType(typedArray, arrayType, bytesPerElement);
                expect(typedArray.length).toBe(elemCount);
            }
        );
    });

    describe('zero-copy memory sharing', () => {
        describe('float types', () => {
            it('shares memory for Float32Array', () => {
                ba.init(ba.FLOAT32, 5);

                ba.setAtF(0, 1.5);
                ba.setAtF(1, 2.5);

                const arr = cm.toTypedArray(ba);
                expectTypedArrayType(arr, 'Float32Array', 4);

                // ByteArray → TypedArray
                expect(arr[0]).toBeCloseTo(1.5, 5);
                expect(arr[1]).toBeCloseTo(2.5, 5);

                // TypedArray → ByteArray
                arr[2] = 3.5;
                expect(ba.getAtF(2)).toBeCloseTo(3.5, 5);
            });

            it('shares memory for Float64Array', () => {
                ba.init(ba.FLOAT64, 3);

                ba.setAtF(0, 1.23456789);
                const arr = cm.toTypedArray(ba);
                expectTypedArrayType(arr, 'Float64Array', 8);

                expect(arr[0]).toBeCloseTo(1.23456789, 8);

                arr[1] = 2.3456789;
                expect(ba.getAtF(1)).toBeCloseTo(2.3456789, 8);
            });
        });

        describe('integer types', () => {
            it('shares memory for Uint8Array', () => {
                ba.init(ba.UINT8, 5);

                ba.setAt(0, 10);
                const arr = cm.toTypedArray(ba);
                expectTypedArrayType(arr, 'Uint8Array', 1);

                expect(arr[0]).toBe(10);

                arr[1] = 20;
                expect(ba.getAt(1)).toBe(20);
            });

            it('shares memory for Int32Array', () => {
                ba.init(ba.INT32, 3);

                ba.setAt(0, -100);
                const arr = cm.toTypedArray(ba);
                expectTypedArrayType(arr, 'Int32Array', 4);

                expect(arr[0]).toBe(-100);

                arr[1] = 200;
                expect(ba.getAt(1)).toBe(200);
            });
        });

        it('handles rapid alternating updates', () => {
            ba.init(ba.FLOAT32, 5);
            const arr = cm.toTypedArray(ba);

            // Alternating updates
            ba.setAtF(0, 1.0);
            arr[1] = 2.0;
            ba.setAtF(2, 3.0);
            arr[3] = 4.0;
            ba.setAtF(4, 5.0);

            // Verify all values
            expect(arr[0]).toBeCloseTo(1.0, 5);
            expect(ba.getAtF(1)).toBeCloseTo(2.0, 5);
            expect(arr[2]).toBeCloseTo(3.0, 5);
            expect(ba.getAtF(3)).toBeCloseTo(4.0, 5);
            expect(arr[4]).toBeCloseTo(5.0, 5);
        });
    });

    describe('multiple views', () => {
        it('allows multiple TypedArray views of same ByteArray', () => {
            ba.init(ba.FLOAT64, 5);

            const arr1 = cm.toTypedArray(ba);
            const arr2 = cm.toTypedArray(ba);

            expectTypedArrayType(arr1, 'Float64Array', 8);
            expectTypedArrayType(arr2, 'Float64Array', 8);

            // Modify via first view
            arr1[0] = 1.5;

            // Verify in second view and ByteArray
            expect(arr2[0]).toBeCloseTo(1.5, 8);
            expect(ba.getAtF(0)).toBeCloseTo(1.5, 8);

            // Modify via second view
            arr2[1] = 2.5;

            // Verify in first view and ByteArray
            expect(arr1[1]).toBeCloseTo(2.5, 8);
            expect(ba.getAtF(1)).toBeCloseTo(2.5, 8);
        });
    });

    describe('edge cases', () => {
        it('handles single element arrays', () => {
            ba.init(ba.INT32, 1);
            ba.setAt(0, 42);

            const arr = cm.toTypedArray(ba);
            expectTypedArrayType(arr, 'Int32Array', 4);

            expect(arr.length).toBe(1);
            expect(arr[0]).toBe(42);

            arr[0] = 100;
            expect(ba.getAt(0)).toBe(100);
        });

        it('handles large arrays efficiently', () => {
            const size = 10000;
            ba.init(ba.FLOAT32, size);

            // Fill with pattern
            for (let i = 0; i < size; i++) {
                ba.setAtF(i, i * 0.5);
            }

            const arr = cm.toTypedArray(ba);
            expectTypedArrayType(arr, 'Float32Array', 4);

            expect(arr.length).toBe(size);
            expect(arr[0]).toBeCloseTo(0, 5);
            expect(arr[100]).toBeCloseTo(50, 5);
            expect(arr[size - 1]).toBeCloseTo((size - 1) * 0.5, 5);
        });

        it.each([
            { type: 'INT8', min: -128, max: 127 },
            { type: 'UINT8', min: 0, max: 255 },
            { type: 'INT16', min: -32768, max: 32767 },
            { type: 'UINT16', min: 0, max: 65535 },
        ])('handles value range extremes for $type', ({ type, min, max }) => {
            ba.init((ba as any)[type], 3);

            ba.setAt(0, min);
            ba.setAt(1, 0);
            ba.setAt(2, max);

            const arr = cm.toTypedArray(ba);

            expect(arr[0]).toBe(min);
            expect(arr[1]).toBe(0);
            expect(arr[2]).toBe(max);
        });
    });

    describe('TypedArray standard operations', () => {
        it('supports subarray() with shared memory', () => {
            ba.init(ba.INT32, 10);
            for (let i = 0; i < 10; i++) {
                ba.setAt(i, i);
            }

            const arr = cm.toTypedArray(ba);
            const sub = arr.subarray(2, 5);

            expect(sub.length).toBe(3);
            expect([...sub]).toEqual([2, 3, 4]);

            // Subarray shares memory
            sub[0] = 99;
            expect(ba.getAt(2)).toBe(99);
        });

        it('supports slice() with copied memory', () => {
            ba.init(ba.FLOAT32, 5);
            for (let i = 0; i < 5; i++) {
                ba.setAtF(i, i * 1.5);
            }

            const arr = cm.toTypedArray(ba);
            const sliced = arr.slice(1, 4);

            expect(sliced.length).toBe(3);
            expect(sliced[0]).toBeCloseTo(1.5, 5);

            // Slice creates copy
            sliced[0] = 99;
            expect(ba.getAtF(1)).toBeCloseTo(1.5, 5);
        });

        it('supports fill() operation', () => {
            ba.init(ba.UINT16, 10);
            const arr = cm.toTypedArray(ba);

            arr.fill(42);

            for (let i = 0; i < 10; i++) {
                expect(ba.getAt(i)).toBe(42);
            }
        });

        it('supports iteration', () => {
            ba.init(ba.INT32, 5);
            for (let i = 0; i < 5; i++) {
                ba.setAt(i, i * 10);
            }

            const arr = cm.toTypedArray(ba);
            const values = [...arr];

            expect(values).toEqual([0, 10, 20, 30, 40]);
        });
    });

    describe('memory management and lifetime', () => {
        // Note: These tests verify zero-copy behavior through value propagation
        // rather than ArrayBuffer identity. N-API implementations may wrap the
        // same native buffer in different ArrayBuffer objects, but the underlying
        // memory is still shared. Value propagation is the definitive test.

        it('keeps ByteArray alive while TypedArray exists', () => {
            let arr: any;

            {
                const ba2 = cm.createObj('ByteArray') as ByteArray;
                ba2.init(ba2.FLOAT32, 5);
                for (let i = 0; i < 5; i++) {
                    ba2.setAtF(i, i * 1.5);
                }

                arr = cm.toTypedArray(ba2);
                expectTypedArrayType(arr, 'Float32Array', 4);

                // ba2 goes out of scope here
            }

            // Force GC if available
            if (global.gc) {
                global.gc();
            }

            // TypedArray should still be valid
            expect(arr[0]).toBeCloseTo(0, 5);
            expect(arr[1]).toBeCloseTo(1.5, 5);
            expect(arr[2]).toBeCloseTo(3.0, 5);
            expect(arr[3]).toBeCloseTo(4.5, 5);
            expect(arr[4]).toBeCloseTo(6.0, 5);
        });

        it('maintains data integrity with multiple views after ByteArray release', () => {
            let arr1: any, arr2: any;

            {
                const ba2 = cm.createObj('ByteArray') as ByteArray;
                ba2.init(ba2.INT32, 10);

                for (let i = 0; i < 10; i++) {
                    ba2.setAt(i, i * 100);
                }

                arr1 = cm.toTypedArray(ba2);
                arr2 = cm.toTypedArray(ba2);

                // ba2 goes out of scope
            }

            if (global.gc) {
                global.gc();
            }

            // Both views should remain valid and share memory
            expect(arr1[0]).toBe(0);
            expect(arr2[0]).toBe(0);

            arr1[5] = 999;
            expect(arr2[5]).toBe(999);

            arr2[8] = 888;
            expect(arr1[8]).toBe(888);
        });

        it('allows ByteArray to be GC\'d when all TypedArrays are released', () => {
            // Create and release ByteArray
            {
                const ba2 = cm.createObj('ByteArray') as ByteArray;
                ba2.init(ba2.FLOAT64, 100);

                {
                    const arr = cm.toTypedArray(ba2);
                    arr[0] = 42.5;
                    expect(ba2.getAtF(0)).toBeCloseTo(42.5, 8);
                    // arr goes out of scope
                }

                if (global.gc) {
                    global.gc();
                }

                // ByteArray should still be accessible
                expect(ba2.getAtF(0)).toBeCloseTo(42.5, 8);

                // ba2 goes out of scope
            }

            if (global.gc) {
                global.gc();
            }

            // No way to verify ByteArray was collected, but no crash means success
            expect(true).toBe(true);
        });

        it('handles TypedArray operations after ByteArray modifications', () => {
            ba.init(ba.UINT32, 10);
            const arr = cm.toTypedArray(ba);

            // Initial values
            for (let i = 0; i < 10; i++) {
                ba.setAt(i, i);
            }

            expect([...arr]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

            // Modify through ByteArray
            for (let i = 0; i < 10; i++) {
                ba.setAt(i, i * 10);
            }

            expect([...arr]).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);

            // Modify through TypedArray
            arr.fill(0);

            for (let i = 0; i < 10; i++) {
                expect(ba.getAt(i)).toBe(0);
            }
        });

        it('maintains separate ArrayBuffers for different ByteArrays', () => {
            const ba1 = cm.createObj('ByteArray') as ByteArray;
            const ba2 = cm.createObj('ByteArray') as ByteArray;

            ba1.init(ba1.INT32, 5);
            ba2.init(ba2.INT32, 5);

            const arr1 = cm.toTypedArray(ba1);
            const arr2 = cm.toTypedArray(ba2);

            // Set different values
            arr1.fill(111);
            arr2.fill(222);

            // Verify independence through value isolation
            expect([...arr1]).toEqual([111, 111, 111, 111, 111]);
            expect([...arr2]).toEqual([222, 222, 222, 222, 222]);

            // Modify one array
            arr1[2] = 999;

            // Other array should be unaffected
            expect(arr1[2]).toBe(999);
            expect(arr2[2]).toBe(222);

            // Verify with ByteArray access
            expect(ba1.getAt(2)).toBe(999);
            expect(ba2.getAt(2)).toBe(222);
        });

        it('handles stress test with many views', () => {
            ba.init(ba.FLOAT32, 100);

            // Create many views
            const views = [];
            for (let i = 0; i < 20; i++) {
                views.push(cm.toTypedArray(ba));
            }

            // All views should have same length and byteLength
            for (const view of views) {
                expect(view.length).toBe(100);
                expect(view.byteLength).toBe(400);
            }

            // Modification through any view affects all (proves memory sharing)
            views[0][50] = 99.5;
            views[5][75] = 88.8;
            views[15][25] = 77.7;

            // Verify all views see the changes (zero-copy behavior)
            for (const view of views) {
                expect(view[50]).toBeCloseTo(99.5, 5);
                expect(view[75]).toBeCloseTo(88.8, 5);
                expect(view[25]).toBeCloseTo(77.7, 5);
            }

            // Verify ByteArray also sees the changes
            expect(ba.getAtF(50)).toBeCloseTo(99.5, 5);
            expect(ba.getAtF(75)).toBeCloseTo(88.8, 5);
            expect(ba.getAtF(25)).toBeCloseTo(77.7, 5);
        });
    });

    describe('error handling', () => {
        it('throws error for invalid argument types', () => {
            expect(() => cm.toTypedArray(null as any))
                .toThrow();

            expect(() => cm.toTypedArray(undefined as any))
                .toThrow();

            expect(() => cm.toTypedArray(42 as any))
                .toThrow();

            expect(() => cm.toTypedArray('not a wrapper' as any))
                .toThrow();
        });

        it('throws error for non-ByteArray wrapper', () => {
            const vector = cm.createObj('Vector');

            expect(() => cm.toTypedArray(vector as any))
                .toThrow(/must be.*ByteArray/i);
        });

        it('throws error for uninitialized ByteArray', () => {
            // ByteArray created but not initialized
            expect(() => cm.toTypedArray(ba))
                .toThrow();
        });
    });
});

/**
 * Test suite for fromTypedArray - zero-copy TypedArray to ByteArray conversion
 * 
 * The fromTypedArray function creates a ByteArray that shares memory with the
 * original TypedArray (zero-copy), similar to numpy's from_ndarray.
 */

describe('fromTypedArray - Zero-Copy TypedArray Conversion', () => {
    describe('Float32Array conversion', () => {
        it('should create ByteArray from Float32Array with shared memory', () => {
            const srcData = new Float32Array([1.5, 2.5, 3.5, 4.5]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.FLOAT32);
            expect(ba.elemCount).toBe(4);
            expect(ba.getAtF(0)).toBeCloseTo(1.5);
            expect(ba.getAtF(3)).toBeCloseTo(4.5);
        });

        it('should share memory with original Float32Array (zero-copy)', () => {
            const srcData = new Float32Array([10.0, 20.0, 30.0]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            // Verify initial values
            expect(ba.getAtF(1)).toBeCloseTo(20.0);

            // Modify original array
            srcData[1] = 99.0;

            // Should be visible in ByteArray (zero-copy behavior)
            expect(ba.getAtF(1)).toBeCloseTo(99.0);
        });
    });

    describe('Float64Array conversion', () => {
        it('should create ByteArray from Float64Array with shared memory', () => {
            const srcData = new Float64Array([Math.PI, Math.E, Math.SQRT2]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.FLOAT64);
            expect(ba.elemCount).toBe(3);
            expect(ba.getAtF(0)).toBeCloseTo(Math.PI);
            expect(ba.getAtF(1)).toBeCloseTo(Math.E);
        });
    });

    describe('Integer TypedArray conversions', () => {
        it('should handle Uint8Array', () => {
            const srcData = new Uint8Array([0, 127, 255]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.UINT8);
            expect(ba.elemCount).toBe(3);
            expect(ba.getAt(0)).toBe(0);
            expect(ba.getAt(2)).toBe(255);
        });

        it('should handle Uint8ClampedArray', () => {
            const srcData = new Uint8ClampedArray([0, 128, 255]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.UINT8);
            expect(ba.elemCount).toBe(3);
        });

        it('should handle Int8Array with negative values', () => {
            const srcData = new Int8Array([-128, 0, 127]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.INT8);
            expect(ba.elemCount).toBe(3);
            expect(ba.getAt(0)).toBe(-128);
            expect(ba.getAt(2)).toBe(127);
        });

        it('should handle Uint16Array', () => {
            const srcData = new Uint16Array([0, 32768, 65535]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.UINT16);
            expect(ba.elemCount).toBe(3);
        });

        it('should handle Int16Array', () => {
            const srcData = new Int16Array([-32768, 0, 32767]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.INT16);
            expect(ba.elemCount).toBe(3);
        });

        it('should handle Uint32Array', () => {
            const srcData = new Uint32Array([0, 2147483648, 4294967295]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.UINT32);
            expect(ba.elemCount).toBe(3);
        });

        it('should handle Int32Array', () => {
            const srcData = new Int32Array([-2147483648, 0, 2147483647]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.INT32);
            expect(ba.elemCount).toBe(3);
        });
    });

    describe('Memory sharing behavior', () => {
        it('should maintain shared memory after modifying TypedArray', () => {
            const srcData = new Float32Array([1, 2, 3, 4]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            // Modify via TypedArray
            srcData[0] = 999;
            srcData[3] = 888;

            // Verify changes visible in ByteArray
            expect(ba.getAtF(0)).toBeCloseTo(999);
            expect(ba.getAtF(3)).toBeCloseTo(888);
        });

        it('should share memory for integer arrays', () => {
            const srcData = new Uint32Array([100, 200, 300, 400]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            // Modify original array
            srcData[0] = 999;
            expect(ba.getAt(0)).toBe(999);

            srcData[2] = 777;
            expect(ba.getAt(2)).toBe(777);
        });
    });

    describe('TypedArray with byte offset', () => {
        it('should handle TypedArray created from ArrayBuffer with offset', () => {
            const buffer = new ArrayBuffer(32);
            const fullView = new Float32Array(buffer);
            fullView[0] = 1.0;
            fullView[1] = 2.0;
            fullView[2] = 3.0;
            fullView[3] = 4.0;

            // Create view starting at byte offset 8 (element index 2)
            const offsetView = new Float32Array(buffer, 8, 2);
            const ba = cm.fromTypedArray(offsetView) as ByteArray;

            expect(ba.elemCount).toBe(2);
            expect(ba.getAtF(0)).toBeCloseTo(3.0);
            expect(ba.getAtF(1)).toBeCloseTo(4.0);
        });

        it('should share memory with offset view correctly', () => {
            const buffer = new ArrayBuffer(32);
            const fullView = new Float32Array(buffer);
            fullView[2] = 10.0;

            const offsetView = new Float32Array(buffer, 8, 2);
            const ba = cm.fromTypedArray(offsetView) as ByteArray;

            expect(ba.getAtF(0)).toBeCloseTo(10.0);

            // Modify via offset view
            offsetView[0] = 99.0;
            expect(ba.getAtF(0)).toBeCloseTo(99.0);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty TypedArray', () => {
            const srcData = new Float32Array([]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemCount).toBe(0);
        });

        it('should handle single element TypedArray', () => {
            const srcData = new Float64Array([42.0]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemCount).toBe(1);
            expect(ba.getAtF(0)).toBeCloseTo(42.0);
        });

        it('should handle large TypedArray', () => {
            const size = 100000;
            const srcData = new Float32Array(size);
            for (let i = 0; i < size; i++) {
                srcData[i] = i * 0.5;
            }

            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemCount).toBe(size);
            expect(ba.getAtF(0)).toBeCloseTo(0.0);
            expect(ba.getAtF(size - 1)).toBeCloseTo((size - 1) * 0.5);
        });
    });

    describe('Error handling', () => {
        it('should throw error for non-TypedArray argument', () => {
            expect(() => {
                cm.fromTypedArray([1, 2, 3] as any);
            }).toThrow();
        });

        it('should throw error for null argument', () => {
            expect(() => {
                cm.fromTypedArray(null as any);
            }).toThrow();
        });

        it('should throw error for undefined argument', () => {
            expect(() => {
                cm.fromTypedArray(undefined as any);
            }).toThrow();
        });

        it('should reject BigInt64Array', () => {
            const srcData = new BigInt64Array([1n, 2n, 3n]);
            expect(() => {
                cm.fromTypedArray(srcData as any);
            }).toThrow();
        });

        it('should reject BigUint64Array', () => {
            const srcData = new BigUint64Array([1n, 2n, 3n]);
            expect(() => {
                cm.fromTypedArray(srcData as any);
            }).toThrow();
        });
    });

    describe('Element type constants verification', () => {
        it('should map Float32Array to FLOAT32', () => {
            const srcData = new Float32Array([1.0]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.FLOAT32);
        });

        it('should map Float64Array to FLOAT64', () => {
            const srcData = new Float64Array([1.0]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.FLOAT64);
        });

        it('should map Int8Array to INT8', () => {
            const srcData = new Int8Array([1]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.INT8);
        });

        it('should map Uint8Array to UINT8', () => {
            const srcData = new Uint8Array([1]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.UINT8);
        });

        it('should map Int16Array to INT16', () => {
            const srcData = new Int16Array([1]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.INT16);
        });

        it('should map Uint16Array to UINT16', () => {
            const srcData = new Uint16Array([1]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.UINT16);
        });

        it('should map Int32Array to INT32', () => {
            const srcData = new Int32Array([1]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.INT32);
        });

        it('should map Uint32Array to UINT32', () => {
            const srcData = new Uint32Array([1]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.UINT32);
        });
    });

    describe('ByteArray length property', () => {
        it('should calculate byte length correctly for Float32Array', () => {
            const srcData = new Float32Array([1, 2, 3, 4, 5]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            // Float32Array: 5 elements * 4 bytes = 20 bytes
            expect(ba.length).toBe(20);
        });

        it('should calculate byte length correctly for Float64Array', () => {
            const srcData = new Float64Array([1, 2, 3, 4, 5]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            // Float64Array: 5 elements * 8 bytes = 40 bytes
            expect(ba.length).toBe(40);
        });

        it('should calculate byte length correctly for Uint8Array', () => {
            const srcData = new Uint8Array([1, 2, 3, 4, 5]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            // Uint8Array: 5 elements * 1 byte = 5 bytes
            expect(ba.length).toBe(5);
        });

        it('should calculate byte length correctly for Int32Array', () => {
            const srcData = new Int32Array([1, 2, 3, 4, 5]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            // Int32Array: 5 elements * 4 bytes = 20 bytes
            expect(ba.length).toBe(20);
        });
    });
});
