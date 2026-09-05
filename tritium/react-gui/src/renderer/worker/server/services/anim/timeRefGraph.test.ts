/**
 * @file worker/server/services/anim/timeRefGraph.test.ts
 * @description Pins the TS mirror of `AnimMgr::resolveTimeImpl`: name-based
 * first-match lookup, order independence, the three failure states and where
 * each lands on a chain, and the write-time checks built on it. The chain
 * fixtures (A 0-1000 absolute, B rel(A) 0-500, C rel(B) 100-300) share their
 * numbers with the `AnimMgrResolveTest` gtest so the two stay in step.
 */

import { describe, it, expect } from 'vitest';
import {
    buildTimeRefGraph,
    checkName,
    checkTimeRef,
    describeResolveFailure,
    type TimeRefInput,
} from './timeRefGraph';

const el = (uid: number, name: string, ref: string, s: number, e: number): TimeRefInput => ({
    uid,
    name,
    timeRefName: ref,
    startMs: s,
    endMs: e,
});

const A = el(1, 'A', '', 0, 1000);
const B = el(2, 'B', 'A', 0, 500);
const C = el(3, 'C', 'B', 100, 300);

const states = (inputs: TimeRefInput[]) =>
    buildTimeRefGraph(inputs).nodes.map((n) => [n.name, n.state, n.absStartMs, n.absEndMs]);

describe('buildTimeRefGraph', () => {
    it('resolves absolute elements to their own offsets', () => {
        const g = buildTimeRefGraph([A, el(2, 'X', '', 200, 900)]);
        expect(g.ok).toBe(true);
        expect(states([A, el(2, 'X', '', 200, 900)])).toEqual([
            ['A', 'ok', 0, 1000],
            ['X', 'ok', 200, 900],
        ]);
    });

    it('offsets a chained element from the END of its reference, whatever the list order', () => {
        // Same numbers as the gtest: B starts at A's end (1000), C at B's end (1500).
        const expected = [
            ['A', 'ok', 0, 1000],
            ['B', 'ok', 1000, 1500],
            ['C', 'ok', 1600, 1800],
        ];
        expect(states([A, B, C])).toEqual(expected);
        expect(states([C, B, A])).toEqual([expected[2], expected[1], expected[0]]);
    });

    it('marks a missing reference and everything chained to it as upstream', () => {
        const g = buildTimeRefGraph([A, el(2, 'B', 'ghost', 0, 500), C]);
        expect(g.ok).toBe(false);
        expect(g.nodes.map((n) => [n.name, n.state])).toEqual([
            ['A', 'ok'],
            ['B', 'missing'],
            ['C', 'upstream'],
        ]);
        expect(g.nodes[1].error).toBe('"B" is relative to "ghost", which does not exist');
        expect(g.nodes[2].error).toBe('"C" chains to "B", whose timing does not resolve');
        expect(g.nodes[1].absStartMs).toBeNull();
        expect(g.nodes[2].absEndMs).toBeNull();
    });

    it('treats a self-reference as a cycle of one', () => {
        const g = buildTimeRefGraph([el(1, 'A', 'A', 0, 1000)]);
        expect(g.nodes[0].state).toBe('cycle');
        expect(g.nodes[0].error).toBe('Cyclic reference: A -> A');
    });

    it('marks every element on a loop as cycle and the ones feeding it as upstream', () => {
        const g = buildTimeRefGraph([
            el(1, 'A', 'B', 0, 1000),
            el(2, 'B', 'A', 0, 500),
            el(3, 'C', 'A', 0, 100),
        ]);
        expect(g.nodes.map((n) => [n.name, n.state])).toEqual([
            ['A', 'cycle'],
            ['B', 'cycle'],
            ['C', 'upstream'],
        ]);
        expect(g.nodes[0].error).toBe('Cyclic reference: A -> B -> A');
        expect(g.nodes[1].error).toBe('Cyclic reference: A -> B -> A');
    });

    it('binds a duplicate name to its first carrier, as C++ does, and lists the duplicates', () => {
        const g = buildTimeRefGraph([
            el(1, 'A', '', 0, 1000),
            el(2, 'A', '', 0, 5000),
            el(3, 'B', 'A', 0, 500),
        ]);
        expect(g.firstIndexByName.get('A')).toBe(0);
        expect([...g.duplicateNames]).toEqual(['A']);
        expect(g.nodes[2].refIndex).toBe(0);
        expect(g.nodes[2].absStartMs).toBe(1000);
    });

    it('never binds a reference to an element with an empty name', () => {
        const g = buildTimeRefGraph([el(1, '', '', 0, 1000), el(2, 'B', '', 0, 500)]);
        expect(g.firstIndexByName.has('')).toBe(false);
        expect(g.nodes[0].state).toBe('ok');
    });
});

describe('checkTimeRef', () => {
    const chain = buildTimeRefGraph([A, B, C]);

    it('accepts the empty name as absolute with base 0', () => {
        expect(checkTimeRef(chain, 3, '')).toEqual({ ok: true, baseEndMs: 0, refIndex: -1 });
    });

    it('resolves a legal reference to its absolute end', () => {
        expect(checkTimeRef(chain, 3, 'A')).toEqual({ ok: true, baseEndMs: 1000, refIndex: 0 });
    });

    it('rejects a name carried by more than one element', () => {
        const g = buildTimeRefGraph([el(1, 'A', '', 0, 1), el(2, 'A', '', 0, 1), el(3, 'B', '', 0, 1)]);
        expect(checkTimeRef(g, 3, 'A')).toEqual({
            ok: false,
            error: '"A" is carried by 2 elements; rename one first',
            code: 'invalid-args',
        });
    });

    it('rejects a name no element carries', () => {
        expect(checkTimeRef(chain, 3, 'ghost')).toEqual({
            ok: false,
            error: 'No element is named "ghost"',
            code: 'not-found',
        });
    });

    it('rejects the element itself', () => {
        expect(checkTimeRef(chain, 2, 'B')).toEqual({
            ok: false,
            error: 'An element cannot be relative to itself',
            code: 'invalid-args',
        });
    });

    it('rejects a reference that chains back to the element, naming the loop', () => {
        // A <- B <- C: making A relative to C would close A -> C -> B -> A.
        expect(checkTimeRef(chain, 1, 'C')).toEqual({
            ok: false,
            error: 'Relative to "C" would create a cycle: A -> C -> B -> A',
            code: 'invalid-args',
        });
    });

    it('rejects a reference whose own timing does not resolve', () => {
        const g = buildTimeRefGraph([A, el(2, 'B', 'ghost', 0, 500), el(3, 'C', '', 0, 1)]);
        expect(checkTimeRef(g, 3, 'B')).toEqual({
            ok: false,
            error: '"B" cannot be used as a reference: "B" is relative to "ghost", which does not exist',
            code: 'invalid-args',
        });
    });

    it('fails for an element that is not in the graph', () => {
        expect(checkTimeRef(chain, 99, 'A')).toMatchObject({ ok: false, code: 'not-found' });
    });
});

describe('checkName', () => {
    const g = buildTimeRefGraph([A, B]);

    it('trims and accepts a fresh name, and an element keeping its own name', () => {
        expect(checkName(g, 2, '  D ')).toEqual({ ok: true, name: 'D' });
        expect(checkName(g, 2, 'B')).toEqual({ ok: true, name: 'B' });
    });

    it('rejects an empty name', () => {
        expect(checkName(g, 2, '   ')).toEqual({
            ok: false,
            error: 'Name cannot be empty',
            code: 'invalid-args',
        });
    });

    it('rejects a name another element carries', () => {
        expect(checkName(g, 2, 'A')).toEqual({
            ok: false,
            error: 'Another element is already named "A"',
            code: 'invalid-args',
        });
    });
});

describe('describeResolveFailure', () => {
    it('is null when everything resolves', () => {
        expect(describeResolveFailure(buildTimeRefGraph([A, B, C]))).toBeNull();
    });

    it('names the root cause rather than an element that merely chains to it', () => {
        const g = buildTimeRefGraph([el(3, 'C', 'B', 0, 1), A, el(2, 'B', 'ghost', 0, 500)]);
        expect(describeResolveFailure(g)).toBe('"B" is relative to "ghost", which does not exist');
    });
});
