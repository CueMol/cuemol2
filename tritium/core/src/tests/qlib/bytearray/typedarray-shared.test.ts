import { cm } from '../../setup';
import type { ByteArray } from '@/wrappers/ByteArray';
import { expectTypedArrayType, TYPE_MAPPINGS } from './typedarray.test';

// ============================================================================
// toTypedArray tests - ByteArray to TypedArray with memory sharing (zero-copy)
// ============================================================================

describe('toTypedArray (zero-copy)', () => {
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

                const arr = cm.toTypedArray(ba);

                expectTypedArrayType(arr, arrayType, bytesPerElement);
                expect(arr.length).toBe(elemCount);
                expect(ba.elemType).toBe((ba as any)[baType]);
                expect(ba.elemCount).toBe(elemCount);
            }
        );
    });

    describe('zero-copy memory sharing', () => {
        it('shares memory for Float32 - modifications via ByteArray visible in TypedArray', () => {
            ba.init(ba.FLOAT32, 5);
            ba.setAtF(0, 1.5);
            ba.setAtF(1, 2.5);

            const arr = cm.toTypedArray(ba) as Float32Array;

            expect(arr[0]).toBeCloseTo(1.5, 5);
            expect(arr[1]).toBeCloseTo(2.5, 5);

            // Modify via ByteArray
            ba.setAtF(0, 99.5);

            // Change visible in TypedArray (proves memory sharing)
            expect(arr[0]).toBeCloseTo(99.5, 5);
        });

        it('shares memory for Int32 - modifications via TypedArray visible in ByteArray', () => {
            ba.init(ba.INT32, 5);
            const arr = cm.toTypedArray(ba) as Int32Array;

            // Modify via TypedArray
            arr[0] = 100;
            arr[3] = 300;

            // Changes visible in ByteArray (proves memory sharing)
            expect(ba.getAt(0)).toBe(100);
            expect(ba.getAt(3)).toBe(300);
        });

        it('bidirectional memory sharing - changes from either side visible', () => {
            ba.init(ba.UINT32, 10);
            const arr = cm.toTypedArray(ba) as Uint32Array;

            // Set via ByteArray
            for (let i = 0; i < 10; i++) {
                ba.setAt(i, i * 10);
            }
            expect([...arr]).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);

            // Modify via TypedArray
            arr.fill(0);

            // Verify via ByteArray
            for (let i = 0; i < 10; i++) {
                expect(ba.getAt(i)).toBe(0);
            }
        });

        it('multiple TypedArrays share same memory', () => {
            ba.init(ba.FLOAT64, 5);
            const arr1 = cm.toTypedArray(ba) as Float64Array;
            const arr2 = cm.toTypedArray(ba) as Float64Array;

            // Modify via first array
            arr1[2] = 42.5;

            // Visible in second array and ByteArray
            expect(arr2[2]).toBeCloseTo(42.5, 8);
            expect(ba.getAtF(2)).toBeCloseTo(42.5, 8);
        });

        it('maintains separate memory for different ByteArrays', () => {
            const ba1 = cm.createObj('ByteArray') as ByteArray;
            const ba2 = cm.createObj('ByteArray') as ByteArray;
            ba1.init(ba1.INT32, 5);
            ba2.init(ba2.INT32, 5);

            const arr1 = cm.toTypedArray(ba1) as Int32Array;
            const arr2 = cm.toTypedArray(ba2) as Int32Array;

            arr1.fill(111);
            arr2.fill(222);

            // Arrays are independent
            expect(arr1[0]).toBe(111);
            expect(arr2[0]).toBe(222);
            expect(ba1.getAt(0)).toBe(111);
            expect(ba2.getAt(0)).toBe(222);
        });

        it('stress test - many views share same memory', () => {
            ba.init(ba.FLOAT32, 100);

            // Create many views
            const views: Float32Array[] = [];
            for (let i = 0; i < 20; i++) {
                views.push(cm.toTypedArray(ba) as Float32Array);
            }

            // All views have correct metadata
            for (const view of views) {
                expect(view.length).toBe(100);
                expect(view.byteLength).toBe(400);
            }

            // Modify via different views
            views[0][25] = 1.1;
            views[5][50] = 2.2;
            views[15][75] = 3.3;

            // All views see all changes
            for (const view of views) {
                expect(view[25]).toBeCloseTo(1.1, 5);
                expect(view[50]).toBeCloseTo(2.2, 5);
                expect(view[75]).toBeCloseTo(3.3, 5);
            }
        });
    });

    describe('memory lifetime - TypedArray keeps ByteArray alive', () => {
        it('keeps ByteArray alive while TypedArray exists', () => {
            let arr: Float32Array;

            {
                // ByteArray goes out of scope
                const ba2 = cm.createObj('ByteArray') as ByteArray;
                ba2.init(ba2.FLOAT32, 5);
                for (let i = 0; i < 5; i++) {
                    ba2.setAtF(i, i * 1.5);
                }

                arr = cm.toTypedArray(ba2) as Float32Array;
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            // TypedArray should still be valid with correct data
            expect(arr[0]).toBeCloseTo(0, 5);
            expect(arr[1]).toBeCloseTo(1.5, 5);
            expect(arr[2]).toBeCloseTo(3.0, 5);
            expect(arr[3]).toBeCloseTo(4.5, 5);
            expect(arr[4]).toBeCloseTo(6.0, 5);
        });

        it('multiple views maintain data integrity after ByteArray release', () => {
            let arr1: Int32Array, arr2: Int32Array;

            {
                const ba2 = cm.createObj('ByteArray') as ByteArray;
                ba2.init(ba2.INT32, 10);
                for (let i = 0; i < 10; i++) {
                    ba2.setAt(i, i * 100);
                }

                arr1 = cm.toTypedArray(ba2) as Int32Array;
                arr2 = cm.toTypedArray(ba2) as Int32Array;
            }

            if (global.gc) {
                global.gc();
            }

            // Both views remain valid and share memory
            expect(arr1[0]).toBe(0);
            expect(arr2[0]).toBe(0);

            arr1[5] = 999;
            expect(arr2[5]).toBe(999);

            arr2[8] = 888;
            expect(arr1[8]).toBe(888);
        });

        it('ByteArray can be GC\'d when all TypedArrays are released', () => {
            {
                const ba2 = cm.createObj('ByteArray') as ByteArray;
                ba2.init(ba2.FLOAT64, 100);

                {
                    const arr = cm.toTypedArray(ba2);
                    (arr as Float64Array)[0] = 42.5;
                    expect(ba2.getAtF(0)).toBeCloseTo(42.5, 8);
                }

                if (global.gc) {
                    global.gc();
                }

                // ByteArray should still be accessible
                expect(ba2.getAtF(0)).toBeCloseTo(42.5, 8);
            }

            if (global.gc) {
                global.gc();
            }

            // No crash means successful cleanup
            expect(true).toBe(true);
        });
    });

    describe('error handling', () => {
        it('throws error for invalid argument types', () => {
            expect(() => cm.toTypedArray(null as any)).toThrow();
            expect(() => cm.toTypedArray(undefined as any)).toThrow();
            expect(() => cm.toTypedArray(42 as any)).toThrow();
            expect(() => cm.toTypedArray('invalid' as any)).toThrow();
        });

        it('throws error for non-ByteArray wrapper', () => {
            const vector = cm.createObj('Vector');
            expect(() => cm.toTypedArray(vector as any)).toThrow(/ByteArray/i);
        });

        it('throws error for uninitialized ByteArray', () => {
            expect(() => cm.toTypedArray(ba)).toThrow();
        });
    });
});

// ============================================================================
// fromTypedArray tests - TypedArray to ByteArray with memory sharing (zero-copy)
// ============================================================================

describe('fromTypedArray (zero-copy)', () => {
    describe('type detection and metadata', () => {
        it.each(TYPE_MAPPINGS)(
            'detects $baType from $arrayType',
            ({ baType, arrayType, bytesPerElement }) => {
                const Constructor = globalThis[arrayType as keyof typeof globalThis] as any;
                const srcData = new Constructor(5);

                const ba = cm.fromTypedArray(srcData) as ByteArray;

                expect(ba.elemType).toBe((ba as any)[baType]);
                expect(ba.elemCount).toBe(5);
                expect(ba.length).toBe(5 * bytesPerElement);
            }
        );

        it('handles Uint8ClampedArray as Uint8', () => {
            const srcData = new Uint8ClampedArray([0, 128, 255]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.UINT8);
            expect(ba.elemCount).toBe(3);
        });
    });

    describe('zero-copy memory sharing', () => {
        it('shares memory for Float32 - modifications via TypedArray visible in ByteArray', () => {
            const srcData = new Float32Array([1.5, 2.5, 3.5]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.getAtF(0)).toBeCloseTo(1.5, 5);

            // Modify via TypedArray
            srcData[0] = 99.5;

            // Change visible in ByteArray
            expect(ba.getAtF(0)).toBeCloseTo(99.5, 5);
        });

        it('shares memory for Int32 - modifications via ByteArray visible in TypedArray', () => {
            const srcData = new Int32Array([10, 20, 30]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            // Modify via ByteArray
            ba.setAt(1, 999);

            // Change visible in TypedArray
            expect(srcData[1]).toBe(999);
        });

        it('bidirectional memory sharing - Float64', () => {
            const srcData = new Float64Array([Math.PI, Math.E, Math.SQRT2]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemType).toBe(ba.FLOAT64);
            expect(ba.getAtF(0)).toBeCloseTo(Math.PI, 8);

            // Modify via ByteArray
            ba.setAtF(1, 42.0);

            // Visible in TypedArray
            expect(srcData[1]).toBeCloseTo(42.0, 8);
        });
    });

    describe('memory lifetime - ByteArray keeps TypedArray alive', () => {
        it('TypedArray data remains accessible after local scope', () => {
            let ba: ByteArray;

            {
                const srcData = new Float32Array([1.0, 2.0, 3.0]);
                ba = cm.fromTypedArray(srcData) as ByteArray;

                // srcData goes out of scope
            }

            if (global.gc) {
                global.gc();
            }

            // ByteArray should still have valid data
            expect(ba.elemCount).toBe(3);
            expect(ba.getAtF(0)).toBeCloseTo(1.0, 5);
            expect(ba.getAtF(1)).toBeCloseTo(2.0, 5);
        });

        it('maintains memory sharing after garbage collection', () => {
            const srcData = new Int32Array([100, 200, 300]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            if (global.gc) {
                global.gc();
            }

            // Memory sharing still works
            srcData[0] = 999;
            expect(ba.getAt(0)).toBe(999);

            ba.setAt(2, 777);
            expect(srcData[2]).toBe(777);
        });
    });

    describe('special cases', () => {
        it('handles TypedArray with byte offset', () => {
            const buffer = new ArrayBuffer(32);
            const fullView = new Float32Array(buffer);
            fullView[2] = 3.0;
            fullView[3] = 4.0;

            // Create view starting at byte offset 8 (element index 2)
            const offsetView = new Float32Array(buffer, 8, 2);
            const ba = cm.fromTypedArray(offsetView) as ByteArray;

            expect(ba.elemCount).toBe(2);
            expect(ba.getAtF(0)).toBeCloseTo(3.0, 5);
            expect(ba.getAtF(1)).toBeCloseTo(4.0, 5);

            // Memory sharing with offset view
            offsetView[0] = 99.0;
            expect(ba.getAtF(0)).toBeCloseTo(99.0, 5);
        });

        it('handles empty TypedArray', () => {
            const srcData = new Float32Array(0);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemCount).toBe(0);
            expect(ba.length).toBe(0);
        });

        it('handles single element TypedArray', () => {
            const srcData = new Float64Array([42.0]);
            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemCount).toBe(1);
            expect(ba.getAtF(0)).toBeCloseTo(42.0, 8);
        });

        it('handles large TypedArray', () => {
            const size = 100000;
            const srcData = new Float32Array(size);
            for (let i = 0; i < size; i++) {
                srcData[i] = i * 0.5;
            }

            const ba = cm.fromTypedArray(srcData) as ByteArray;

            expect(ba.elemCount).toBe(size);
            expect(ba.getAtF(0)).toBeCloseTo(0, 5);
            expect(ba.getAtF(size - 1)).toBeCloseTo((size - 1) * 0.5, 5);
        });
    });

    describe('error handling', () => {
        it('throws error for non-TypedArray input', () => {
            expect(() => cm.fromTypedArray([1, 2, 3])).toThrow();
            expect(() => cm.fromTypedArray('invalid')).toThrow();
            expect(() => cm.fromTypedArray({})).toThrow();
        });

        it('throws error for missing argument', () => {
            expect(() => (cm.fromTypedArray as any)()).toThrow();
        });
    });
});
