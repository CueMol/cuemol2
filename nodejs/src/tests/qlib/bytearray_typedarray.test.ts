import { cm } from '../setup';
import type { ByteArray } from '@/wrappers/ByteArray';

describe('ByteArray', () => {
    let ba: ByteArray;

    beforeEach(() => {
        ba = cm.createObj('ByteArray') as ByteArray;
    });

    describe('copyToTypedArray', () => {
        it('copies data to a typed array correctly', () => {
            ba.init(ba.FLOAT32, 100);
            // Set some values
            for (let i = 0; i < 100; i++) {
                ba.setAtF(i, i * 1.5);
            }
            const typedArray = cm.copyToTypedArray(ba) as Float32Array;
            expect(typedArray.length).toBe(100);
            // expect(typedArray[10]).toBeCloseTo(15.0);
            for (let i = 0; i < 100; i++) {
                expect(typedArray[i]).toBeCloseTo(i * 1.5);
            }
        });
    });
});


describe('copyFromTypedArray', () => {
    describe('integer types', () => {
        it('creates ByteArray from Uint8Array', () => {
            const srcData = new Uint8Array([10, 20, 30, 40, 50]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(5); // 5 elements * 1 byte
            expect(ba.getValue(0)).toBe(10);
            expect(ba.getValue(1)).toBe(20);
            expect(ba.getValue(4)).toBe(50);
        });

        it('creates ByteArray from Int8Array', () => {
            const srcData = new Int8Array([-10, -20, 30, 40]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(4);
            // Note: values might need special handling for signed types
        });

        it('creates ByteArray from Uint16Array', () => {
            const srcData = new Uint16Array([1000, 2000, 3000]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(6); // 3 elements * 2 bytes
            expect(ba.getAt(0)).toBe(1000);
            expect(ba.getAt(1)).toBe(2000);
            expect(ba.getAt(2)).toBe(3000);
        });

        it('creates ByteArray from Int16Array', () => {
            const srcData = new Int16Array([-1000, 2000, -3000]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(6);
        });

        it('creates ByteArray from Uint32Array', () => {
            const srcData = new Uint32Array([100000, 200000, 300000]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(12); // 3 elements * 4 bytes
            expect(ba.getAt(0)).toBe(100000);
            expect(ba.getAt(1)).toBe(200000);
        });

        it('creates ByteArray from Int32Array', () => {
            const srcData = new Int32Array([100000, -200000, 300000]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(12);
        });
    });

    describe('floating point types', () => {
        it('creates ByteArray from Float32Array', () => {
            const srcData = new Float32Array([1.5, 2.5, 3.5, 4.5]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(16); // 4 elements * 4 bytes
            expect(ba.getAtF(0)).toBeCloseTo(1.5, 5);
            expect(ba.getAtF(1)).toBeCloseTo(2.5, 5);
            expect(ba.getAtF(2)).toBeCloseTo(3.5, 5);
            expect(ba.getAtF(3)).toBeCloseTo(4.5, 5);
        });

        it('creates ByteArray from Float64Array', () => {
            const srcData = new Float64Array([1.123456789, 2.987654321]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(16); // 2 elements * 8 bytes
            expect(ba.getAtF(0)).toBeCloseTo(1.123456789, 8);
            expect(ba.getAtF(1)).toBeCloseTo(2.987654321, 8);
        });
    });

    describe('data independence', () => {
        it('copies data rather than referencing it', () => {
            const srcData = new Uint8Array([10, 20, 30]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            // Modify source data
            srcData[0] = 99;

            // ByteArray should have original value (data was copied)
            expect(ba.getValue(0)).toBe(10);
        });
    });

    describe('error handling', () => {
        it('throws error for non-TypedArray input', () => {
            expect(() => {
                cm.copyFromTypedArray([1, 2, 3]);
            }).toThrow();

            expect(() => {
                cm.copyFromTypedArray('invalid');
            }).toThrow();

            expect(() => {
                cm.copyFromTypedArray({});
            }).toThrow();
        });

        it('throws error for missing argument', () => {
            expect(() => {
                (cm.copyFromTypedArray as any)();
            }).toThrow();
        });
    });

    describe('edge cases', () => {
        it('handles empty TypedArray', () => {
            const srcData = new Uint8Array(0);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(0);
        });

        it('handles large TypedArray', () => {
            const srcData = new Uint32Array(10000);
            for (let i = 0; i < 10000; i++) {
                srcData[i] = i;
            }

            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(40000); // 10000 elements * 4 bytes
            expect(ba.getAt(0)).toBe(0);
            expect(ba.getAt(9999)).toBe(9999);
        });

        it('handles Uint8ClampedArray', () => {
            const srcData = new Uint8ClampedArray([0, 128, 255]);
            const ba = cm.copyFromTypedArray(srcData) as ByteArray;

            expect(ba.length).toBe(3);
            expect(ba.getValue(0)).toBe(0);
            expect(ba.getValue(1)).toBe(128);
            expect(ba.getValue(2)).toBe(255);
        });
    });

    describe('TypedArray with byte offset', () => {
        it('handles TypedArray created from ArrayBuffer with offset', () => {
            const buffer = new ArrayBuffer(20);
            const fullView = new Uint8Array(buffer);
            fullView.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

            // Create view starting at byte offset 4
            const offsetView = new Uint8Array(buffer, 4, 4);
            
            const ba = cm.copyFromTypedArray(offsetView) as ByteArray;

            expect(ba.length).toBe(4);
            expect(ba.getValue(0)).toBe(5); // Element at offset 4
            expect(ba.getValue(1)).toBe(6);
            expect(ba.getValue(2)).toBe(7);
            expect(ba.getValue(3)).toBe(8);
        });
    });
});

