/**
 * Memory Lifetime Tests for toTypedArray / fromTypedArray
 *
 * These tests verify actual memory management behavior by tracking
 * alloc/free events at the C++ level and using deterministic GC
 * to verify correct cleanup timing.
 *
 * Requires: --expose-gc in NODE_OPTIONS for GC-dependent tests.
 *
 * What is tested:
 *   - Finalizers and onDestroy callbacks fire exactly once (no double-free)
 *   - Finalizers fire at the correct time (after GC of the owning JS object)
 *   - No orphaned resources remain after full cleanup (no leaks)
 *   - Data stays valid while shared references exist (no use-after-free)
 *   - Process-level memory does not grow with repeated alloc/free cycles
 */

import { cm } from '../../setup';
import type { ByteArray } from '@/wrappers/ByteArray';

// ============================================================================
// Helpers
// ============================================================================

const GC_AVAILABLE = typeof global.gc === 'function';

/** Tracking stats shape returned from C++ */
interface MemTrackingStats {
    toTypedArrayAllocs: number;
    toTypedArrayFrees: number;
    fromTypedArrayRefAllocs: number;
    fromTypedArrayRefFrees: number;
}

/**
 * Run GC and yield once to allow N-API ArrayBuffer finalizers
 * and weak-reference callbacks to be dispatched.
 *
 * N-API queues weak-reference / postrequire-release callbacks
 * on the microtask queue, so a single setImmediate after gc()
 * is sufficient to process them all.
 */
const gcAndSettle = async (): Promise<void> => {
    if (!GC_AVAILABLE) return;
    global.gc!();
    await new Promise<void>(r => setImmediate(r));
    global.gc!();
    await new Promise<void>(r => setImmediate(r));
    global.gc!();
    await new Promise<void>(r => setImmediate(r));
    global.gc!();
    await new Promise<void>(r => setImmediate(r));
};

/**
 * Create a Float32 ByteArray via copyFromTypedArray (single native call).
 * Much faster than calling setAtF() N times through the JS-C++ bridge.
 */
const createFloat32BA = (count: number): ByteArray => {
    const src = new Float32Array(count);
    for (let i = 0; i < count; i++) src[i] = i * 1.5;
    return cm.copyFromTypedArray(src) as ByteArray;
};

/** Get tracking stats (shorthand) */
const stats = (): MemTrackingStats => cm.getMemoryTrackingStats();

/**
 * Flush pending finalizers and reset counters.
 * Used in beforeEach to ensure clean slate.
 */
const flushAndReset = async (): Promise<void> => {
    await gcAndSettle();
    cm.resetMemoryTracking();
};

// ============================================================================
// Gate: skip all GC tests if --expose-gc is not available
// ============================================================================

const describeGC = GC_AVAILABLE ? describe : describe.skip;

// ============================================================================
// toTypedArray - ArrayBuffer finalizer lifecycle
// ============================================================================

describeGC('toTypedArray - finalizer lifecycle', () => {

    beforeEach(flushAndReset);

    // ------------------------------------------------------------------
    // Correct timing: finalizer fires ONLY after TypedArray is GC'd
    // ------------------------------------------------------------------

    it('does NOT fire finalizer while TypedArray is still reachable', async () => {
        const ba = createFloat32BA(10);
        const arr = cm.toTypedArray(ba) as Float32Array;

        expect(stats().toTypedArrayAllocs).toBe(1);

        await gcAndSettle();

        expect(stats().toTypedArrayFrees).toBe(0);
        // Prove data is still valid
        expect(arr[0]).toBeCloseTo(0.0);
        expect(arr[9]).toBeCloseTo(13.5);

        void arr;
    });

    it('fires finalizer exactly once after TypedArray is GC\'d', async () => {
        const ba = createFloat32BA(10);

        const create = () => {
            const a = cm.toTypedArray(ba) as Float32Array;
            expect(a.length).toBe(10);
        };
        create();

        expect(stats().toTypedArrayAllocs).toBe(1);
        expect(stats().toTypedArrayFrees).toBe(0);

        await gcAndSettle();

        expect(stats().toTypedArrayFrees).toBe(1);
    });

    // ------------------------------------------------------------------
    // No double-free: N views -> exactly N frees
    // ------------------------------------------------------------------

    it('fires exactly N finalizers for N views after all are GC\'d', async () => {
        const N = 20;
        const ba = createFloat32BA(10);

        const createViews = () => {
            for (let i = 0; i < N; i++) {
                const a = cm.toTypedArray(ba);
                if (a.length !== 10) throw new Error('unexpected');
            }
        };
        createViews();

        expect(stats().toTypedArrayAllocs).toBe(N);

        await gcAndSettle();

        const s = stats();
        expect(s.toTypedArrayFrees).toBe(N);
        expect(s.toTypedArrayFrees).toBeLessThanOrEqual(s.toTypedArrayAllocs);
    });

    it('no-double-free invariant holds with interleaved creation/GC', async () => {
        const ba = createFloat32BA(10);

        for (let round = 0; round < 5; round++) {
            const batch = () => {
                for (let i = 0; i < 10; i++) {
                    void cm.toTypedArray(ba);
                }
            };
            batch();
            await gcAndSettle();

            const s = stats();
            expect(s.toTypedArrayFrees).toBeLessThanOrEqual(s.toTypedArrayAllocs);
        }

        const final_s = stats();
        expect(final_s.toTypedArrayAllocs).toBe(50);
        expect(final_s.toTypedArrayFrees).toBe(50);
    });

    // ------------------------------------------------------------------
    // No leak: retained view keeps data alive, release frees it
    // ------------------------------------------------------------------

    it('ByteArray stays alive while ANY TypedArray view exists', async () => {
        let kept: Float32Array;

        const setup = () => {
            const ba = createFloat32BA(5);
            void cm.toTypedArray(ba);   // discard
            kept = cm.toTypedArray(ba) as Float32Array;
        };
        setup();

        expect(stats().toTypedArrayAllocs).toBe(2);

        await gcAndSettle();

        const s = stats();
        expect(s.toTypedArrayFrees).toBeGreaterThanOrEqual(1);
        expect(s.toTypedArrayFrees).toBeLessThan(s.toTypedArrayAllocs);

        // Data must still be valid through the kept view
        expect(kept![0]).toBeCloseTo(0.0);
        expect(kept![4]).toBeCloseTo(6.0);

        // Prove writes work (no use-after-free / segfault)
        kept![2] = 999.0;
        expect(kept![2]).toBeCloseTo(999.0);
    });
});

// ============================================================================
// fromTypedArray - onDestroy / ObjectReference lifecycle
// ============================================================================

describeGC('fromTypedArray - onDestroy lifecycle', () => {

    beforeEach(flushAndReset);

    // ------------------------------------------------------------------
    // Correct timing: ObjectReference released when ByteArray is GC'd
    // ------------------------------------------------------------------

    it('does NOT release ObjectReference while ByteArray is alive', async () => {
        const src = new Float32Array([1, 2, 3]);
        const ba = cm.fromTypedArray(src) as ByteArray;

        expect(stats().fromTypedArrayRefAllocs).toBe(1);

        await gcAndSettle();

        expect(stats().fromTypedArrayRefFrees).toBe(0);
        expect(ba.getAtF(0)).toBeCloseTo(1.0);

        void ba;
    });

    it('releases ObjectReference exactly once after ByteArray is GC\'d', async () => {
        const create = () => {
            const src = new Float32Array([10, 20, 30]);
            const ba = cm.fromTypedArray(src) as ByteArray;
            expect(ba.elemCount).toBe(3);
        };
        create();

        expect(stats().fromTypedArrayRefAllocs).toBe(1);
        expect(stats().fromTypedArrayRefFrees).toBe(0);

        await gcAndSettle();

        // Chain: Wrapper::~Wrapper -> delete LScrSp* -> ~LByteArray -> ~Array
        //        -> clear() -> onDestroy -> ObjectReference released
        expect(stats().fromTypedArrayRefFrees).toBe(1);
    });

    // ------------------------------------------------------------------
    // No double-free: N ByteArrays -> exactly N onDestroy calls
    // ------------------------------------------------------------------

    it('fires exactly N onDestroy callbacks for N ByteArrays', async () => {
        const N = 15;

        const batch = () => {
            for (let i = 0; i < N; i++) {
                const src = new Float32Array([i, i + 1, i + 2]);
                void cm.fromTypedArray(src);
            }
        };
        batch();

        expect(stats().fromTypedArrayRefAllocs).toBe(N);

        await gcAndSettle();

        const s = stats();
        expect(s.fromTypedArrayRefFrees).toBe(N);
        expect(s.fromTypedArrayRefFrees).toBeLessThanOrEqual(s.fromTypedArrayRefAllocs);
    });

    // ------------------------------------------------------------------
    // Data validity: TypedArray data survives while ByteArray holds ref
    // ------------------------------------------------------------------

    it('TypedArray data survives GC because ByteArray holds ObjectReference', async () => {
        let ba: ByteArray;

        const setup = () => {
            const src = new Float32Array([100.5, 200.5, 300.5]);
            ba = cm.fromTypedArray(src) as ByteArray;
            // src goes out of scope, but C++ ObjectReference keeps it alive
        };
        setup();

        await gcAndSettle();

        expect(stats().fromTypedArrayRefFrees).toBe(0);
        // Data must still be valid (proves no use-after-free)
        expect(ba!.getAtF(0)).toBeCloseTo(100.5);
        expect(ba!.getAtF(1)).toBeCloseTo(200.5);
        expect(ba!.getAtF(2)).toBeCloseTo(300.5);
    });
});

// ============================================================================
// Cross-direction lifecycle
// ============================================================================

describeGC('Cross-direction - toTypedArray / fromTypedArray chain', () => {

    beforeEach(flushAndReset);

    it('all resources freed when full chain is GC\'d', async () => {
        const chain = () => {
            const ba = createFloat32BA(5);
            const ta = cm.toTypedArray(ba) as Float32Array;
            const ba2 = cm.fromTypedArray(ta) as ByteArray;
            expect(ba2.getAtF(3)).toBeCloseTo(4.5);
        };
        chain();

        expect(stats().toTypedArrayAllocs).toBe(1);
        expect(stats().fromTypedArrayRefAllocs).toBe(1);

        await gcAndSettle();

        const after = stats();
        expect(after.toTypedArrayFrees).toBe(after.toTypedArrayAllocs);
        expect(after.fromTypedArrayRefFrees).toBe(after.fromTypedArrayRefAllocs);
    });

    it('partial chain survival: keeping middle TypedArray alive', async () => {
        let ta = null as unknown as Float32Array;

        const setup = () => {
            const ba = createFloat32BA(5);
            ta = cm.toTypedArray(ba) as Float32Array;
            const ba2 = cm.fromTypedArray(ta) as ByteArray;
            void ba2;
        };
        setup();

        await gcAndSettle();

        const s = stats();
        // toTypedArray's shared_ptr: still alive (ta's ArrayBuffer holds it)
        expect(s.toTypedArrayFrees).toBe(0);
        // fromTypedArray's ref: ba2 was GC'd -> onDestroy ran
        expect(s.fromTypedArrayRefFrees).toBe(1);

        // TypedArray data is still valid
        expect(ta[0]).toBeCloseTo(0.0);
        expect(ta[4]).toBeCloseTo(6.0);

        void ta;
    });
});

// ============================================================================
// Process-level memory leak detection
//
// Strategy: use small-but-detectable allocation sizes with enough cycles.
// 50 cycles x 40KB = 2MB total if leaked - easily detectable via heapUsed.
// The key metric is allocs == frees (counter balance), with heap as safety net.
// ============================================================================

describeGC('Memory leak detection (process-level)', () => {

    const getHeapMB = (): number => process.memoryUsage().heapUsed / (1024 * 1024);

    beforeEach(flushAndReset);

    it('toTypedArray: no leak over 50 create/discard cycles', async () => {
        const ELEM_COUNT = 10_000;  // ~40KB per Float32Array
        const CYCLES = 50;

        const ba = createFloat32BA(ELEM_COUNT);

        // Warm up (JIT + allocator)
        (() => { void cm.toTypedArray(ba); })();
        await gcAndSettle();
        cm.resetMemoryTracking();

        const baseHeap = getHeapMB();

        for (let i = 0; i < CYCLES; i++) {
            (() => { void cm.toTypedArray(ba); })();
        }
        await gcAndSettle();

        const s = stats();
        expect(s.toTypedArrayAllocs).toBe(CYCLES);
        expect(s.toTypedArrayFrees).toBe(CYCLES);

        const growth = getHeapMB() - baseHeap;
        expect(growth).toBeLessThan(10);
    });

    it('fromTypedArray: no leak over 50 create/discard cycles', async () => {
        const ELEM_COUNT = 10_000;
        const CYCLES = 50;

        // Warm up
        (() => { void cm.fromTypedArray(new Float32Array(100)); })();
        await gcAndSettle();
        cm.resetMemoryTracking();

        const baseHeap = getHeapMB();

        for (let i = 0; i < CYCLES; i++) {
            (() => { void cm.fromTypedArray(new Float32Array(ELEM_COUNT)); })();
        }
        await gcAndSettle();

        const s = stats();
        expect(s.fromTypedArrayRefAllocs).toBe(CYCLES);
        expect(s.fromTypedArrayRefFrees).toBe(CYCLES);

        const growth = getHeapMB() - baseHeap;
        expect(growth).toBeLessThan(10);
    });

    it('round-trip: no leak over 30 toTypedArray -> fromTypedArray cycles', async () => {
        const ELEM_COUNT = 10_000;
        const CYCLES = 30;

        // Warm up
        (() => {
            const ba = createFloat32BA(100);
            void cm.fromTypedArray(cm.toTypedArray(ba));
        })();
        await gcAndSettle();
        cm.resetMemoryTracking();

        const baseHeap = getHeapMB();

        for (let i = 0; i < CYCLES; i++) {
            (() => {
                const ba = createFloat32BA(ELEM_COUNT);
                void cm.fromTypedArray(cm.toTypedArray(ba));
            })();
        }
        await gcAndSettle();

        const s = stats();
        expect(s.toTypedArrayFrees).toBe(s.toTypedArrayAllocs);
        expect(s.fromTypedArrayRefFrees).toBe(s.fromTypedArrayRefAllocs);

        const growth = getHeapMB() - baseHeap;
        expect(growth).toBeLessThan(10);
    });
});

// ============================================================================
// Counter invariant (runs without GC too)
// ============================================================================

describe('Memory tracking counter invariants (no GC required)', () => {

    beforeEach(flushAndReset);

    it('toTypedArray alloc count equals number of views created', () => {
        const ba = createFloat32BA(10);
        const views: Float32Array[] = [];

        for (let i = 0; i < 7; i++) {
            views.push(cm.toTypedArray(ba) as Float32Array);
        }

        expect(stats().toTypedArrayAllocs).toBe(7);
        expect(stats().toTypedArrayFrees).toBe(0);

        // Prove all views share data
        ba.setAtF(5, 42.0);
        for (const v of views) {
            expect(v[5]).toBeCloseTo(42.0);
        }
    });

    it('fromTypedArray alloc count equals number of ByteArrays created', () => {
        const arrays: ByteArray[] = [];

        for (let i = 0; i < 5; i++) {
            arrays.push(cm.fromTypedArray(new Float32Array([i])) as ByteArray);
        }

        expect(stats().fromTypedArrayRefAllocs).toBe(5);
        expect(stats().fromTypedArrayRefFrees).toBe(0);
    });

    it('resetMemoryTracking zeroes all counters', () => {
        const ba = createFloat32BA(3);
        void cm.toTypedArray(ba);
        void cm.fromTypedArray(new Float32Array([1]));

        const before = stats();
        expect(before.toTypedArrayAllocs).toBeGreaterThan(0);
        expect(before.fromTypedArrayRefAllocs).toBeGreaterThan(0);

        cm.resetMemoryTracking();

        const after = stats();
        expect(after.toTypedArrayAllocs).toBe(0);
        expect(after.toTypedArrayFrees).toBe(0);
        expect(after.fromTypedArrayRefAllocs).toBe(0);
        expect(after.fromTypedArrayRefFrees).toBe(0);
    });
});
