import { describe, it, expect } from 'vitest';
import { forEachAnimObj, collectAnimObjs } from '@renderer/worker/server/services/helpers/animResolve';
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
