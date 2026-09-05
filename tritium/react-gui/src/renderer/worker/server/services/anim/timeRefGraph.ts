/**
 * @file worker/server/services/anim/timeRefGraph.ts
 * @description The animation elements' time-reference chain, resolved in TS.
 *
 * An element's start / end are offsets from the END of the element named by
 * its `timeRefName` (`''` = absolute, offsets from 0). C++
 * `AnimMgr::resolveTimeImpl` turns the chain into absolute times, but it
 * validates nothing up front: a missing or cyclic reference makes it throw
 * half-way, and every later resolve fails the same way until a name is fixed
 * by hand. This module applies the same rules -- lookup by exact name, first
 * match in list order, the element itself included, recursion so list order
 * does not matter -- without touching a wrapper, so a write can be checked
 * before it lands and the timeline can say which strips are unresolved and
 * why.
 *
 * The rules are mirrored, not shared: `timeRefGraph.test.ts` and the
 * `AnimMgrResolveTest` gtest fixture pin the same numbers.
 */

import type { AnimTimeRefState } from '@renderer/worker/shared/animTypes';
import { fail, type Fail } from '@renderer/worker/shared/result';

/** One element as the resolver sees it: identity, names and RELATIVE ms. */
export interface TimeRefInput {
    uid: number;
    name: string;
    timeRefName: string;
    startMs: number;
    endMs: number;
}

export interface TimeRefNode extends TimeRefInput {
    /** Position in the manager (== `getAt` index). */
    index: number;
    state: AnimTimeRefState;
    /** Why the element does not resolve; set exactly when `state !== 'ok'`. */
    error?: string;
    /** Index of the element `timeRefName` binds to; -1 when absolute or missing. */
    refIndex: number;
    /** Absolute ms; non-null exactly when `state === 'ok'`. */
    absStartMs: number | null;
    absEndMs: number | null;
}

export interface TimeRefGraph {
    /** Index-aligned with the input. */
    nodes: TimeRefNode[];
    byUid: Map<number, TimeRefNode>;
    /** Name -> lowest index carrying it; `''` is never a key. */
    firstIndexByName: Map<string, number>;
    /** Names carried by more than one element (references bind to the first). */
    duplicateNames: Set<string>;
    /** True when every element resolves. */
    ok: boolean;
}

export interface TimeRefCheck {
    ok: true;
    /** Absolute end of the reference: the base the element's offsets count from. */
    baseEndMs: number;
    refIndex: number;
}

export interface NameCheck {
    ok: true;
    /** The trimmed name to write. */
    name: string;
}

const q = (s: string) => `"${s}"`;

/**
 * Resolve every element's absolute span, or say why it cannot be resolved.
 *
 * States: `missing` -- the element's own reference names nothing; `cycle` --
 * the element is on a reference loop (a self-reference is a loop of one);
 * `upstream` -- the element chains to one of the above.
 */
export function buildTimeRefGraph(inputs: readonly TimeRefInput[]): TimeRefGraph {
    const nodes: TimeRefNode[] = inputs.map((inp, index) => ({
        ...inp,
        index,
        state: 'ok',
        refIndex: -1,
        absStartMs: null,
        absEndMs: null,
    }));
    const firstIndexByName = new Map<string, number>();
    const duplicateNames = new Set<string>();
    for (const n of nodes) {
        if (n.name === '') continue;
        if (firstIndexByName.has(n.name)) duplicateNames.add(n.name);
        else firstIndexByName.set(n.name, n.index);
    }
    for (const n of nodes) {
        n.refIndex = n.timeRefName === '' ? -1 : (firstIndexByName.get(n.timeRefName) ?? -1);
    }

    const settled = new Array<boolean>(nodes.length).fill(false);
    const settle = (n: TimeRefNode, state: AnimTimeRefState, error?: string) => {
        if (settled[n.index]) return;
        settled[n.index] = true;
        n.state = state;
        if (state === 'ok') return;
        n.error = error;
        n.absStartMs = null;
        n.absEndMs = null;
    };
    const chainsTo = (n: TimeRefNode, ref: TimeRefNode) =>
        `${q(n.name)} chains to ${q(ref.name)}, whose timing does not resolve`;

    // Depth-first along `refIndex`. `path` is the chain being walked, so a
    // node met again on it closes a loop; everything walked before the loop
    // is upstream of it.
    const resolve = (start: TimeRefNode) => {
        const path: TimeRefNode[] = [];
        const onPath = new Set<number>();
        let cur: TimeRefNode | null = start;
        while (cur && !settled[cur.index]) {
            path.push(cur);
            onPath.add(cur.index);
            if (cur.timeRefName === '') {
                cur.absStartMs = cur.startMs;
                cur.absEndMs = cur.endMs;
                settle(cur, 'ok');
                break;
            }
            if (cur.refIndex < 0) {
                settle(
                    cur,
                    'missing',
                    `${q(cur.name)} is relative to ${q(cur.timeRefName)}, which does not exist`,
                );
                break;
            }
            if (onPath.has(cur.refIndex)) {
                const at = path.findIndex((p) => p.index === cur!.refIndex);
                const loop = path.slice(at);
                const names = [...loop.map((p) => p.name), loop[0].name].join(' -> ');
                for (const p of loop) settle(p, 'cycle', `Cyclic reference: ${names}`);
                break;
            }
            cur = nodes[cur.refIndex];
        }
        // Unwind: each node on the path takes its state from the one it
        // chains to (which is settled by now).
        for (let i = path.length - 1; i >= 0; i--) {
            const n = path[i];
            if (settled[n.index]) continue;
            const ref = nodes[n.refIndex];
            if (ref.state === 'ok') {
                n.absStartMs = (ref.absEndMs as number) + n.startMs;
                n.absEndMs = (ref.absEndMs as number) + n.endMs;
                settle(n, 'ok');
            } else {
                settle(n, 'upstream', chainsTo(n, ref));
            }
        }
    };
    for (const n of nodes) resolve(n);

    const byUid = new Map<number, TimeRefNode>();
    for (const n of nodes) if (!byUid.has(n.uid)) byUid.set(n.uid, n);
    return {
        nodes,
        byUid,
        firstIndexByName,
        duplicateNames,
        ok: nodes.every((n) => n.state === 'ok'),
    };
}

/**
 * Can the element `selfUid` be made relative to `ref` right now?
 *
 * Checks, in order: the reference is unambiguous, exists, is not the element
 * itself, does not chain back to it, and resolves. `''` (absolute) always
 * passes with base 0.
 */
export function checkTimeRef(g: TimeRefGraph, selfUid: number, ref: string): TimeRefCheck | Fail {
    const self = g.byUid.get(selfUid);
    if (!self) return fail('animation element no longer exists', 'not-found');
    if (ref === '') return { ok: true, baseEndMs: 0, refIndex: -1 };
    if (g.duplicateNames.has(ref)) {
        const count = g.nodes.filter((n) => n.name === ref).length;
        return fail(`${q(ref)} is carried by ${count} elements; rename one first`, 'invalid-args');
    }
    const idx = g.firstIndexByName.get(ref);
    if (idx === undefined) return fail(`No element is named ${q(ref)}`, 'not-found');
    if (idx === self.index) return fail('An element cannot be relative to itself', 'invalid-args');

    // Walk from the reference: reaching the element itself would close a
    // loop. Checked before the reference's own state, because a reference
    // that currently chains THROUGH the element resolves fine today.
    const path = [self.name, ref];
    const seen = new Set<number>([idx]);
    let cur = g.nodes[idx];
    while (cur.refIndex >= 0 && !seen.has(cur.refIndex)) {
        if (cur.refIndex === self.index) {
            return fail(
                `Relative to ${q(ref)} would create a cycle: ${[...path, self.name].join(' -> ')}`,
                'invalid-args',
            );
        }
        seen.add(cur.refIndex);
        cur = g.nodes[cur.refIndex];
        path.push(cur.name);
    }

    const target = g.nodes[idx];
    if (target.state !== 'ok') {
        return fail(`${q(ref)} cannot be used as a reference: ${target.error}`, 'invalid-args');
    }
    return { ok: true, baseEndMs: target.absEndMs as number, refIndex: idx };
}

/** Can the element `selfUid` take the name `raw`? Names are trimmed, non-empty and unique. */
export function checkName(g: TimeRefGraph, selfUid: number, raw: unknown): NameCheck | Fail {
    if (!g.byUid.has(selfUid)) return fail('animation element no longer exists', 'not-found');
    const name = String(raw ?? '').trim();
    if (name === '') return fail('Name cannot be empty', 'invalid-args');
    const clash = g.nodes.find((n) => n.uid !== selfUid && n.name === name);
    if (clash) return fail(`Another element is already named ${q(name)}`, 'invalid-args');
    return { ok: true, name };
}

/**
 * The reason the chain does not resolve, or null. Prefers a root cause (a
 * missing or cyclic element) over an element that merely chains to one.
 */
export function describeResolveFailure(g: TimeRefGraph): string | null {
    const root = g.nodes.find((n) => n.state === 'missing' || n.state === 'cycle');
    if (root) return root.error ?? null;
    const any = g.nodes.find((n) => n.state !== 'ok');
    return any?.error ?? null;
}
