/**
 * @file hooks/useMolStructure.ts
 * @description Live data source for `MolStructPane`.
 *
 * Enumerates MolCoord-like objects in the active scene and fetches chain
 * names for the currently-selected molecule. Residue and atom data are
 * lazy-loaded on demand via `loadResidues` / `loadAtoms`, cached per
 * chain / residue. The cache is invalidated whenever the active mol
 * changes, and a SEM_OBJECT event subscription forces a full refetch
 * (clearing the cache) when scene topology changes — PDB load, undo,
 * paste, etc. Mirrors UXP `panel.molstruct.onLoad`'s
 * `addListener("topologyChanged", SEM_OBJECT, SEM_CHANGED, -1, ...)`
 * plus the ObjMenuList rebind on SEM_OBJECT ADDED/REMOVING.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncCueMol } from '../worker/client/AsyncCueMol';
import type {
    MolListEntry,
    MolChainEntry,
    MolResidueEntry,
    MolAtomEntry,
} from '../worker/server/services/getMolStructure.service';
import { SEM_OBJECT, SEM_ANY } from '../event';
import { useCueMolEventListener } from './useCueMolEventListener';

export interface UseMolStructureOptions {
    cm: AsyncCueMol | null;
    /** Active scene UID, or undefined when no scene is active. */
    sceneId: number | undefined;
}

export interface UseMolStructureResult {
    /** MolCoord-like objects available in the current scene. */
    mols: MolListEntry[];
    /** Currently-selected molecule uid; undefined when no mol is available. */
    selectedMolId: number | undefined;
    /** Programmatic mol selector — used by the dropdown handler. */
    setSelectedMolId: (uid: number | undefined) => void;
    /** Chain entries for the selected molecule. */
    chains: MolChainEntry[];
    /** Residues already fetched, keyed by chain name. */
    residuesByChain: ReadonlyMap<string, MolResidueEntry[]>;
    /** Atoms already fetched, keyed by `${chain}:${residueIndex}`. */
    atomsByResidue: ReadonlyMap<string, MolAtomEntry[]>;
    /** Lazy fetch — resolves the chain's residue list and caches it. */
    loadResidues: (chainName: string) => Promise<MolResidueEntry[]>;
    /** Lazy fetch — resolves the residue's atom list and caches it. */
    loadAtoms: (chainName: string, residueIndex: string) => Promise<MolAtomEntry[]>;
    /** True while any top-level (mols / chains) fetch is in flight. */
    loading: boolean;
    /**
     * Force a re-fetch of mols + chains AND clear the lazy residue / atom
     * caches. Use this for explicit user actions (e.g. mol switch). The
     * SEM_OBJECT event listener uses a softer refresh that keeps caches.
     */
    refetch: () => void;
}

function atomKey(chainName: string, residueIndex: string): string {
    return `${chainName}:${residueIndex}`;
}

export function useMolStructure({ cm, sceneId }: UseMolStructureOptions): UseMolStructureResult {
    const [mols, setMols] = useState<MolListEntry[]>([]);
    const [selectedMolId, setSelectedMolIdState] = useState<number | undefined>(undefined);
    const [chains, setChains] = useState<MolChainEntry[]>([]);
    const [molsLoading, setMolsLoading] = useState(false);
    const [chainsLoading, setChainsLoading] = useState(false);
    const [residuesByChain, setResiduesByChain] = useState<Map<string, MolResidueEntry[]>>(
        () => new Map(),
    );
    const [atomsByResidue, setAtomsByResidue] = useState<Map<string, MolAtomEntry[]>>(
        () => new Map(),
    );

    // Latest sceneId / selectedMolId in refs so refetch identity stays
    // stable across renders (avoids resubscribing the event listener).
    const sceneIdRef = useRef<number | undefined>(sceneId);
    sceneIdRef.current = sceneId;
    const selectedMolIdRef = useRef<number | undefined>(selectedMolId);
    selectedMolIdRef.current = selectedMolId;
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

    const setSelectedMolId = useCallback(
        (uid: number | undefined) => {
            setSelectedMolIdState(uid);
            clearLazyCaches();
        },
        [clearLazyCaches],
    );

    const fetchMols = useCallback(() => {
        const sid = sceneIdRef.current;
        if (!cm || sid === undefined) {
            setMols([]);
            setSelectedMolIdState(undefined);
            return;
        }
        setMolsLoading(true);
        let cancelled = false;
        cm.invokeService('listMols', { sceneId: sid })
            .then((res) => {
                if (cancelled) return;
                const list = res?.mols ?? [];
                setMols(list);
                setSelectedMolIdState((prev) => {
                    if (prev !== undefined && list.some((m: MolListEntry) => m.uid === prev)) {
                        return prev;
                    }
                    return list.length > 0 ? list[0].uid : undefined;
                });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                console.warn('listMols failed:', err);
                setMols([]);
                setSelectedMolIdState(undefined);
            })
            .finally(() => {
                if (!cancelled) setMolsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [cm]);

    const fetchChains = useCallback(() => {
        const sid = sceneIdRef.current;
        const mid = selectedMolIdRef.current;
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
        fetchMols();
        fetchChains();
    }, [clearLazyCaches, fetchMols, fetchChains]);

    /**
     * Soft refresh used by the SEM_OBJECT listener. We deliberately keep
     * the residue / atom caches: many incoming events are unrelated to
     * topology (renderer added for *selection, mol.sel = ..., visibility
     * toggle, ...), and clearing on every burst would flash "Loading..."
     * across every expanded node each time the user hits Select / Zoom.
     * If chain identity actually changes (PDB reload), stale residue
     * entries simply stop being rendered because the tree only walks
     * chains currently in `chains`.
     */
    const softRefetch = useCallback(() => {
        fetchMols();
        fetchChains();
    }, [fetchMols, fetchChains]);

    // Re-list mols when the active scene changes.
    useEffect(() => {
        return fetchMols();
    }, [cm, sceneId, fetchMols]);

    // Re-fetch chains when the active mol (or scene) changes.
    useEffect(() => {
        return fetchChains();
    }, [cm, sceneId, selectedMolId, fetchChains]);

    // Object add / remove / property-change subscriber. Soft refresh only
    // — the lazy caches stay intact so expanded subtrees do not blank to
    // "Loading...". For genuine topology changes (rare, e.g. applyTopology)
    // a manual refetch via the molecule selector still works.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: SEM_OBJECT,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: softRefetch,
        debounceMs: 30,
    });

    const loadResidues = useCallback(
        (chainName: string): Promise<MolResidueEntry[]> => {
            const sid = sceneIdRef.current;
            const mid = selectedMolIdRef.current;
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
            const mid = selectedMolIdRef.current;
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
        mols,
        selectedMolId,
        setSelectedMolId,
        chains,
        residuesByChain,
        atomsByResidue,
        loadResidues,
        loadAtoms,
        loading: molsLoading || chainsLoading,
        refetch,
    };
}
