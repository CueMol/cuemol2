import { describe, it, expect, vi } from 'vitest';
import { ObjTuple, isFutureRef, isObjTuple } from '../worker/ObjTuple';
import { ObjProxy } from '../worker/ObjProxy';

// ---------------------------------------------------------------------------
// ObjTuple utility functions (pure, no deps)
// ---------------------------------------------------------------------------

describe('ObjTuple utilities', () => {
    it('isFutureRef identifies future references', () => {
        expect(isFutureRef({ future: 42 })).toBe(true);
        expect(isFutureRef({ future: 0 })).toBe(true);
        expect(isFutureRef('abc123')).toBe(false);
        expect(isFutureRef('')).toBe(false);
    });

    it('isObjTuple identifies objects with _obj_id and _class_name', () => {
        expect(isObjTuple(new ObjTuple('abc', 'MyClass'))).toBe(true);
        expect(isObjTuple(new ObjTuple({ future: 1 }, 'Foo'))).toBe(true);
        expect(isObjTuple({ _obj_id: 'x', _class_name: 'Y' })).toBe(true);
        expect(isObjTuple(null)).toBe(false);
        expect(isObjTuple(undefined)).toBe(false);
        expect(isObjTuple('string')).toBe(false);
        expect(isObjTuple(42)).toBe(false);
        expect(isObjTuple({ _obj_id: 'x' })).toBe(false);
    });

    it('ObjTuple stores obj_id and class_name correctly', () => {
        const t1 = new ObjTuple('slot-001', 'Scene');
        expect(t1.objId).toBe('slot-001');
        expect(t1.className).toBe('Scene');

        const t2 = new ObjTuple({ future: 7 }, 'Command');
        expect(isFutureRef(t2.objId)).toBe(true);
        expect(t2.className).toBe('Command');
    });
});

// ---------------------------------------------------------------------------
// ObjProxy error propagation (Worker error → rejected Promise)
// ---------------------------------------------------------------------------

function makeMockAcm(invokeWorkerImpl: (...args: any[]) => Promise<any[]>) {
    let seq = 0;
    return {
        getSeqNo: () => ++seq,
        postPipelined: vi.fn(),
        invokeWorker: vi.fn().mockImplementation(invokeWorkerImpl),
    } as any;
}

describe('ObjProxy.invokeMethod error propagation', () => {
    it('rejects when Worker responds with failure', async () => {
        const mockAcm = makeMockAcm(() => Promise.reject(new Error('worker error')));
        const proxy = new ObjProxy('slot-001', 'Foo', mockAcm);
        await expect(proxy.invokeMethod('someMethod')).rejects.toThrow('worker error');
    });

    it('returns primitive result on success', async () => {
        const mockAcm = makeMockAcm(() => Promise.resolve([42]));
        const proxy = new ObjProxy('slot-001', 'Foo', mockAcm);
        const result = await proxy.invokeMethod('getCount');
        expect(result).toBe(42);
    });

    it('returns ObjProxy when Worker responds with ObjTuple', async () => {
        const retTuple = new ObjTuple('slot-002', 'Bar');
        const mockAcm = makeMockAcm(() => Promise.resolve([retTuple]));
        const proxy = new ObjProxy('slot-001', 'Foo', mockAcm);
        const result = await proxy.invokeMethod('getChild');
        expect(result).toBeInstanceOf(ObjProxy);
        expect((result as ObjProxy).getClassName()).toBe('Bar');
    });
});

describe('ObjProxy.getProp error propagation', () => {
    it('rejects when Worker responds with failure', async () => {
        const mockAcm = makeMockAcm(() => Promise.reject(new Error('prop error')));
        const proxy = new ObjProxy('slot-001', 'Foo', mockAcm);
        await expect(proxy.getProp('name')).rejects.toThrow('prop error');
    });

    it('returns primitive value on success', async () => {
        const mockAcm = makeMockAcm(() => Promise.resolve(['hello']));
        const proxy = new ObjProxy('slot-001', 'Foo', mockAcm);
        expect(await proxy.getProp('name')).toBe('hello');
    });
});

describe('ObjProxy fire-and-forget paths', () => {
    it('invokeMethodVoid sends postPipelined and returns resolved Promise', async () => {
        const mockAcm = makeMockAcm(() => Promise.resolve([]));
        const proxy = new ObjProxy('slot-001', 'Foo', mockAcm);
        const result = proxy.invokeMethodVoid('run');
        await expect(result).resolves.toBeUndefined();
        expect(mockAcm.postPipelined).toHaveBeenCalledWith(
            'invokeMethod', expect.any(Number), expect.arrayContaining(['run'])
        );
    });

    it('invokeMethodObj returns a future ObjProxy synchronously', () => {
        const mockAcm = makeMockAcm(() => Promise.resolve([]));
        const proxy = new ObjProxy('slot-001', 'Foo', mockAcm);
        const result = proxy.invokeMethodObj('getChild', 'Bar');
        expect(result).toBeInstanceOf(ObjProxy);
        expect(result.getClassName()).toBe('Bar');
        expect(isFutureRef(result.getObjTuple().objId)).toBe(true);
    });

    it('getPropObj returns a future ObjProxy synchronously', () => {
        const mockAcm = makeMockAcm(() => Promise.resolve([]));
        const proxy = new ObjProxy('slot-001', 'Foo', mockAcm);
        const result = proxy.getPropObj('child', 'Baz');
        expect(result).toBeInstanceOf(ObjProxy);
        expect(result.getClassName()).toBe('Baz');
        expect(isFutureRef(result.getObjTuple().objId)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// _futureSlot eviction logic (white-box via a standalone replica)
// ---------------------------------------------------------------------------

// Replicate only the slot management logic to test eviction without C++ deps.
class FutureSlotHarness {
    private _slot: { [seq: string]: any } = {};
    private static readonly WINDOW = 256;

    store(seqno: number, value: any): void {
        this._slot[seqno.toString()] = value;
        this._evict(seqno);
    }

    storeBroken(seqno: number, error: Error): void {
        this._slot[seqno.toString()] = { __broken: error };
        this._evict(seqno);
    }

    resolve(seqno: number): any {
        const entry = this._slot[seqno.toString()];
        if (entry === undefined) return undefined;
        if (entry && typeof entry === 'object' && '__broken' in entry) throw entry.__broken;
        return entry;
    }

    size(): number {
        return Object.keys(this._slot).length;
    }

    private _evict(current: number): void {
        const cutoff = current - FutureSlotHarness.WINDOW;
        if (cutoff <= 0) return;
        for (const key of Object.keys(this._slot)) {
            if (parseInt(key, 10) <= cutoff) delete this._slot[key];
        }
    }
}

describe('_futureSlot eviction', () => {
    it('entries within the window are retained', () => {
        const h = new FutureSlotHarness();
        h.store(1, 'obj-1');
        h.store(100, 'obj-100');
        expect(h.resolve(1)).toBe('obj-1');
        expect(h.resolve(100)).toBe('obj-100');
    });

    it('entries outside the window are evicted after a later store', () => {
        const h = new FutureSlotHarness();
        h.store(1, 'old');
        // Advance seqno past the window boundary (256)
        h.store(258, 'new');
        expect(h.resolve(1)).toBeUndefined();
        expect(h.resolve(258)).toBe('new');
    });

    it('slot size stays bounded under continuous pipelining', () => {
        const h = new FutureSlotHarness();
        for (let i = 1; i <= 1000; i++) {
            h.store(i, `obj-${i}`);
        }
        // Only the last WINDOW entries should remain
        expect(h.size()).toBeLessThanOrEqual(256);
    });

    it('broken-future throws on resolve', () => {
        const h = new FutureSlotHarness();
        const err = new Error('load failed');
        h.storeBroken(5, err);
        expect(() => h.resolve(5)).toThrow('load failed');
    });

    it('broken-future is also evicted by window', () => {
        const h = new FutureSlotHarness();
        const err = new Error('load failed');
        h.storeBroken(1, err);
        h.store(258, 'new');
        expect(h.resolve(1)).toBeUndefined();
    });
});
