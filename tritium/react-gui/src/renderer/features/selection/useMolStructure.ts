/**
 * @file features/selection/useMolStructure.ts
 * @description Live data source for `MolStructPane`'s chain / residue
 * / atom tree.
 *
 * The hook is scoped to a single `molId` chosen externally
 * (typically by an `ObjectSelect` widget driving local React state).
 * Chain names are fetched eagerly when the mol changes; residue and
 * atom data are lazy-loaded on demand via `loadResidues` /
 * `loadAtoms`, cached per chain / residue. The cache is invalidated
 * whenever the active mol changes, and a SEM_OBJECT event
 * subscription soft-refetches chains (caches preserved) when scene
 * state churns -- mirrors UXP `panel.molstruct.onLoad`'s
 * `addListener("topologyChanged", SEM_OBJECT, SEM_CHANGED, -1, ...)`.
 *
 * Mol enumeration (the dropdown) lives in `ObjectSelect`; this hook
 * only concerns itself with the structure of the selected mol.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';
import type {
    MolChainEntry,
    MolResidueEntry,
    MolAtomEntry,
} from '@renderer/worker/server/services/getMolStructure.service';
import { SEM_OBJECT, SEM_ANY } from '@renderer/event';
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener';

export interface UseMolStructureOptions {
    cm: AsyncCueMol | null;
    /** Active scene UID, or undefined when no scene is active. */
    sceneId: number | undefined;
    /** Currently-selected molecule uid (e.g. from `ObjectSelect`). */
    molId: number | undefined;
}

export interface UseMolStructureResult {
    /** Chain entries for the selected molecule. */
    chains: MolChainEntry[];
    /** Residues already fetched, keyed by chain name. */
    residuesByChain: ReadonlyMap<string, MolResidueEntry[]>;
    /** Atoms already fetched, keyed by `${chain}:${residueIndex}`. */
    atomsByResidue: ReadonlyMap<string, MolAtomEntry[]>;
    /** Lazy fetch -- resolves the chain's residue list and caches it. */
    loadResidues: (chainName: string) => Promise<MolResidueEntry[]>;
    /** Lazy fetch -- resolves the residue's atom list and caches it. */
    loadAtoms: (chainName: string, residueIndex: string) => Promise<MolAtomEntry[]>;
    /** True while a chains fetch is in flight. */
    loading: boolean;
    /** Force a chains refetch AND clear the lazy residue / atom caches. */
    refetch: () => void;
}

function atomKey(chainName: string, residueIndex: string): string {
    return `${chainName}:${residueIndex}`;
}

export function useMolStructure(
    { cm, sceneId, molId }: UseMolStructureOptions,
): UseMolStructureResult {
    const [chains, setChains] = useState<MolChainEntry[]>([]);
    const [chainsLoading, setChainsLoading] = useState(false);
    const [residuesByChain, setResiduesByChain] = useState<Map<string, MolResidueEntry[]>>(
        () => new Map(),
    );
    const [atomsByResidue, setAtomsByResidue] = useState<Map<string, MolAtomEntry[]>>(
        () => new Map(),
    );

    // Latest sceneId / molId in refs so event-driven refetches keep a
    // stable identity (no resubscribe on every render).
    const sceneIdRef = useRef<number | undefined>(sceneId);
    sceneIdRef.current = sceneId;
    const molIdRef = useRef<number | undefined>(molId);
    molIdRef.current = molId;
    // In-flight lazy fetches deduped by key so React re-renders during
    // load don't trigger a second invokeService.
    const inflightResiduesRef = useRef<Map<string, Promise<MolResidueEntry[]>>>(new Map());
    const inflightAtomsRef = useRef<Map<string, Promise<MolAtomEntry[]>>>(new Map());

    const clearLazyCaches = useCallback(() => {
        setResiduesByChain((prev) => (prev.size === 0 ? prev : new Map()));
        setAtomsByResidue((prev) => (prev.size === 0 ? prev : new Map()));
        inflightResiduesRef.current.clear();
        inflightAtomsRef.current.clear();
    }, []);

    const fetchChains = useCallback(() => {
        const sid = sceneIdRef.current;
        const mid = molIdRef.current;
        if (!cm || sid === undefined || mid === undefined) {
            setChains([]);
            return;
        }
        setChainsLoading(true);
        let cancelled = false;
        cm.invokeService('getMolChains', { sceneId: sid, molId: mid })
            .then((res) => {
                if (cancelled) return;
                setChains(res?.chains ?? []);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                console.warn('getMolChains failed:', err);
                setChains([]);
            })
            .finally(() => {
                if (!cancelled) setChainsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [cm]);

    const refetch = useCallback(() => {
        clearLazyCaches();
        fetchChains();
    }, [clearLazyCaches, fetchChains]);

    // Clear lazy caches and refetch chains whenever the active mol
    // changes. The widget driving `molId` is responsible for picking
    // a sensible default; this hook just reacts.
    useEffect(() => {
        clearLazyCaches();
        return fetchChains();
    }, [cm, sceneId, molId, clearLazyCaches, fetchChains]);

    // SEM_OBJECT subscriber for soft refresh: the lazy caches stay
    // intact so expanded subtrees do not blank to "Loading..." when
    // unrelated events fire (renderer added for *selection, mol.sel
    // assignment, visibility toggle, ...). Genuine topology changes
    // (PDB reload) are rare; the user can force a hard refresh via
    // the mol selector.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined && molId !== undefined,
        category: '',
        srcMask: SEM_OBJECT,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: fetchChains,
        debounceMs: 30,
    });

    const loadResidues = useCallback(
        (chainName: string): Promise<MolResidueEntry[]> => {
            const sid = sceneIdRef.current;
            const mid = molIdRef.current;
            if (!cm || sid === undefined || mid === undefined) return Promise.resolve([]);
            const cached = residuesByChain.get(chainName);
            if (cached) return Promise.resolve(cached);
            const inflight = inflightResiduesRef.current.get(chainName);
            if (inflight) return inflight;
            const promise = cm
                .invokeService('getMolResidues', { sceneId: sid, molId: mid, chainName })
                .then((res) => {
                    const list = res?.residues ?? [];
                    setResiduesByChain((prev) => {
                        const next = new Map(prev);
                        next.set(chainName, list);
                        return next;
                    });
                    return list;
                })
                .catch((err: unknown) => {
                    console.warn('getMolResidues failed:', err);
                    return [] as MolResidueEntry[];
                })
                .finally(() => {
                    inflightResiduesRef.current.delete(chainName);
                });
            inflightResiduesRef.current.set(chainName, promise);
            return promise;
        },
        [cm, residuesByChain],
    );

    const loadAtoms = useCallback(
        (chainName: string, residueIndex: string): Promise<MolAtomEntry[]> => {
            const sid = sceneIdRef.current;
            const mid = molIdRef.current;
            if (!cm || sid === undefined || mid === undefined) return Promise.resolve([]);
            const key = atomKey(chainName, residueIndex);
            const cached = atomsByResidue.get(key);
            if (cached) return Promise.resolve(cached);
            const inflight = inflightAtomsRef.current.get(key);
            if (inflight) return inflight;
            const promise = cm
                .invokeService('getMolAtoms', {
                    sceneId: sid,
                    molId: mid,
                    chainName,
                    residueIndex,
                })
                .then((res) => {
                    const list = res?.atoms ?? [];
                    setAtomsByResidue((prev) => {
                        const next = new Map(prev);
                        next.set(key, list);
                        return next;
                    });
                    return list;
                })
                .catch((err: unknown) => {
                    console.warn('getMolAtoms failed:', err);
                    return [] as MolAtomEntry[];
                })
                .finally(() => {
                    inflightAtomsRef.current.delete(key);
                });
            inflightAtomsRef.current.set(key, promise);
            return promise;
        },
        [cm, atomsByResidue],
    );

    return {
        chains,
        residuesByChain,
        atomsByResidue,
        loadResidues,
        loadAtoms,
        loading: chainsLoading,
        refetch,
    };
}
