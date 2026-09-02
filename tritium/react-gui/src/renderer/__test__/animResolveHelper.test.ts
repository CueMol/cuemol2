import { describe, it, expect } from 'vitest';
import {
    forEachAnimObj,
    collectAnimObjs,
    makeTimeValue,
    readTimeRefInputs,
    tryResolveRel,
} from '@renderer/worker/server/services/anim/resolve';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { AnimMgr } from '@cuemol/core/src/wrappers/AnimMgr';
import type { AnimObj } from '@cuemol/core/src/wrappers/AnimObj';

/**
 * Build a mock AnimMgr from a list of entries. An entry of `'throw'` makes
 * `getAt(i)` throw; `null` returns null; otherwise the entry object is returned.
 */
function makeMgr(entries: Array<AnimObj | null | 'throw'>): AnimMgr {
    return {
        get size() {
            return entries.length;
        },
        getAt(i: number) {
            const e = entries[i];
            if (e === 'throw') throw new Error('bad entry');
            return e;
        },
    } as unknown as AnimMgr;
}

const obj = (uid: number): AnimObj => ({ uid }) as unknown as AnimObj;

describe('forEachAnimObj', () => {
    it('visits every live object with its index', () => {
        const a = obj(1);
        const b = obj(2);
        const seen: Array<[number, number]> = [];
        forEachAnimObj(makeMgr([a, b]), (o, i) => {
            seen.push([(o as unknown as { uid: number }).uid, i]);
            return undefined;
        });
        expect(seen).toEqual([
            [1, 0],
            [2, 1],
        ]);
    });

    it('skips an entry whose getAt(i) throws (continue) and a null entry', () => {
        const a = obj(1);
        const c = obj(3);
        const seen: number[] = [];
        forEachAnimObj(makeMgr([a, 'throw', null, c]), (o) => {
            seen.push((o as unknown as { uid: number }).uid);
            return undefined;
        });
        // index 1 (throw) and index 2 (null) are skipped, not aborting the scan.
        expect(seen).toEqual([1, 3]);
    });

    it('stops and returns the first non-undefined callback result', () => {
        const a = obj(1);
        const b = obj(2);
        const c = obj(3);
        const visited: number[] = [];
        const result = forEachAnimObj(makeMgr([a, b, c]), (o, i) => {
            visited.push((o as unknown as { uid: number }).uid);
            return (o as unknown as { uid: number }).uid === 2 ? { index: i } : undefined;
        });
        expect(result).toEqual({ index: 1 });
        // Scan stopped at the match -- entry 3 was never visited.
        expect(visited).toEqual([1, 2]);
    });

    it('returns undefined and scans all when size read throws (safeNum -> 0)', () => {
        const mgr = {
            get size(): number {
                throw new Error('no size');
            },
            getAt() {
                return obj(99);
            },
        } as unknown as AnimMgr;
        const seen: number[] = [];
        const result = forEachAnimObj(mgr, (o) => {
            seen.push((o as unknown as { uid: number }).uid);
            return undefined;
        });
        expect(result).toBeUndefined();
        expect(seen).toEqual([]);
    });
});

describe('collectAnimObjs', () => {
    it('collects live objects in order, skipping throwing and null entries', () => {
        const a = obj(1);
        const c = obj(3);
        const out = collectAnimObjs(makeMgr([a, 'throw', null, c]));
        expect(out.map((o) => (o as unknown as { uid: number }).uid)).toEqual([1, 3]);
    });
});

describe('makeTimeValue', () => {
    const ctxWith = (created: { millisec: number }[]) =>
        ({
            svc: {
                createObj: (cls: string) => {
                    if (cls !== 'TimeValue') return null;
                    const t = { millisec: 0 };
                    created.push(t);
                    return t;
                },
            },
        }) as unknown as WorkerContext;

    it('rounds to whole milliseconds', () => {
        const created: { millisec: number }[] = [];
        expect(makeTimeValue(ctxWith(created), 1234.6)).toBe(created[0]);
        expect(created[0].millisec).toBe(1235);
    });

    it('returns null when the TimeValue cannot be created', () => {
        const ctx = { svc: { createObj: () => null } } as unknown as WorkerContext;
        expect(makeTimeValue(ctx, 1)).toBeNull();
    });
});

describe('tryResolveRel', () => {
    it('returns null on success and the message on a throw', () => {
        const okMgr = { resolveRelTime: () => undefined } as unknown as AnimMgr;
        expect(tryResolveRel(okMgr)).toBeNull();
        const badMgr = {
            resolveRelTime: () => {
                throw new Error('AnimMgr.resolve failed: AnimObj B cyclic ref');
            },
        } as unknown as AnimMgr;
        expect(tryResolveRel(badMgr)).toBe('AnimMgr.resolve failed: AnimObj B cyclic ref');
    });
});

describe('readTimeRefInputs', () => {
    it('reads names and relative spans in index order, skipping broken entries', () => {
        const a = {
            uid: 1, name: 'A', timeRefName: '', start: { millisec: 0 }, end: { millisec: 1000 },
        } as unknown as AnimObj;
        const b = {
            uid: 2, name: 'B', timeRefName: 'A', start: { millisec: 100 }, end: { millisec: 600 },
        } as unknown as AnimObj;
        expect(readTimeRefInputs(makeMgr([a, 'throw', null, b]))).toEqual([
            { uid: 1, name: 'A', timeRefName: '', startMs: 0, endMs: 1000 },
            { uid: 2, name: 'B', timeRefName: 'A', startMs: 100, endMs: 600 },
        ]);
    });
});
