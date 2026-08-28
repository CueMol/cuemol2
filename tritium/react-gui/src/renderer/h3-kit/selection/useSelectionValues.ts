/**
 * @file h3-kit/selection/useSelectionValues.ts
 * @description Async value resolver feeding the SelectionBuilder's keyword
 * autocomplete with real values from the active molecule.
 *
 * Returns a stable `resolveValues(kind)` that lazily fetches and caches the
 * distinct value set for one keyword kind (chain / resname / aname / elem)
 * via the existing `getMolChains` / `getMolResidues` / `getMolAtoms` worker
 * services. The first call for a kind walks the molecule and dedups; later
 * calls return the cached array. The cache is cleared whenever the active
 * `molId` / `sceneId` changes.
 *
 * @remarks
 *  - `kind` is the autocomplete category, NOT the emitted selection keyword
 *    (e.g. kind "aname" feeds the `name` keyword, kind "resname" feeds `resn`).
 *  - resname / aname / elem require walking residues. To stay cheap on large
 *    structures (up to ~1M atoms) the atom walk is capped: only a sampled
 *    subset of residues is queried. Atom-name / element vocabularies are
 *    small and highly repetitive, so sampling yields essentially the full set
 *    without an O(atoms) sweep.
 *  - Returns [] when no molecule is available; the builder then falls back to
 *    a plain free-text input.
 */

import { useCallback, useRef, useEffect } from 'react';
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol';

/** Autocomplete categories (distinct from emitted selection keywords). */
export type SelValueKind = 'chain' | 'resname' | 'aname' | 'elem';

export interface UseSelectionValuesOptions {
    cm: AsyncCueMol | null;
    /** Active scene UID, or undefined when no scene is active. */
    sceneID: number | undefined;
    /** Currently-selected molecule uid, or undefined. */
    molID: number | undefined;
}

// Cap the number of residues whose atoms we fetch when resolving aname/elem.
// Atom-name and element vocabularies repeat heavily across residues, so a
// modest sample captures the full set without scanning every residue.
const ATOM_SAMPLE_RESIDUES = 40;

export type ResolveValues = (kind: SelValueKind) => Promise<string[]>;

export function useSelectionValues(
    { cm, sceneID, molID }: UseSelectionValuesOptions,
): ResolveValues {
    // Keep latest scene/mol in refs so resolveValues stays identity-stable
    // (the builder uses it in an effect dependency).
    const sceneIdRef = useRef<number | undefined>(sceneID);
    sceneIdRef.current = sceneID;
    const molIdRef = useRef<number | undefined>(molID);
    molIdRef.current = molID;

    // Resolved value set per kind, plus in-flight dedup.
    const cacheRef = useRef<Map<SelValueKind, string[]>>(new Map());
    const inflightRef = useRef<Map<SelValueKind, Promise<string[]>>>(new Map());

    // Drop caches when the target molecule (or scene) changes.
    useEffect(() => {
        cacheRef.current.clear();
        inflightRef.current.clear();
    }, [cm, sceneID, molID]);

    const compute = useCallback(
        async (kind: SelValueKind): Promise<string[]> => {
            const sid = sceneIdRef.current;
            const mid = molIdRef.current;
            if (!cm || sid === undefined || mid === undefined) return [];

            const chainsRes = await cm.invokeService('getMolChains', {
                sceneId: sid,
                molId: mid,
            });
            const chainNames = (chainsRes?.chains ?? []).map((c) => c.name);
            if (kind === 'chain') return dedup(chainNames);

            // resname: collect residue names across all chains.
            if (kind === 'resname') {
                const out = new Set<string>();
                for (const chainName of chainNames) {
                    const res = await cm.invokeService('getMolResidues', {
                        sceneId: sid,
                        molId: mid,
                        chainName,
                    });
                    for (const r of res?.residues ?? []) {
                        if (r.name) out.add(r.name);
                    }
                }
                return [...out];
            }

            // aname / elem: walk a sampled set of residues and collect the
            // requested atom field. The vocabulary is small and repetitive.
            const out = new Set<string>();
            let sampled = 0;
            for (const chainName of chainNames) {
                if (sampled >= ATOM_SAMPLE_RESIDUES) break;
                const res = await cm.invokeService('getMolResidues', {
                    sceneId: sid,
                    molId: mid,
                    chainName,
                });
                for (const r of res?.residues ?? []) {
                    if (sampled >= ATOM_SAMPLE_RESIDUES) break;
                    sampled += 1;
                    const atomsRes = await cm.invokeService('getMolAtoms', {
                        sceneId: sid,
                        molId: mid,
                        chainName,
                        residueIndex: r.index,
                    });
                    for (const a of atomsRes?.atoms ?? []) {
                        const v = kind === 'aname' ? a.name : a.elem;
                        if (v) out.add(v);
                    }
                }
            }
            return [...out];
        },
        [cm],
    );

    return useCallback(
        (kind: SelValueKind): Promise<string[]> => {
            const cached = cacheRef.current.get(kind);
            if (cached) return Promise.resolve(cached);
            const inflight = inflightRef.current.get(kind);
            if (inflight) return inflight;
            const promise = compute(kind)
                .then((vals) => {
                    cacheRef.current.set(kind, vals);
                    return vals;
                })
                .catch((err: unknown) => {
                    console.warn('useSelectionValues resolve failed:', err);
                    return [] as string[];
                })
                .finally(() => {
                    inflightRef.current.delete(kind);
                });
            inflightRef.current.set(kind, promise);
            return promise;
        },
        [compute],
    );
}

function dedup(values: string[]): string[] {
    return [...new Set(values.filter((v) => v !== ''))];
}
