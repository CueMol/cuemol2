/**
 * @file hooks/useMolStructure.ts
 * @description Live data source for `MolStructPane`.
 *
 * Enumerates MolCoord-like objects in the active scene and fetches chain
 * names for the currently-selected molecule. Subscribes to SEM_OBJECT
 * events on the active scene so the pane refreshes when objects are
 * added / removed / renamed (e.g. PDB load) or topology changes — without
 * this the dropdown stays empty when the pane mounts before the first
 * load.
 *
 * Phase 2 will extend this with lazy residue / atom loading (cached per
 * chain / residue) layered on top of the same subscription.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncCueMol } from '../worker/client/AsyncCueMol';
import type { MolListEntry, MolChainEntry } from '../worker/server/services/getMolStructure.service';
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
    /** True while either fetch is in flight. */
    loading: boolean;
    /** Force a re-fetch of both mols and chains. */
    refetch: () => void;
}

export function useMolStructure({ cm, sceneId }: UseMolStructureOptions): UseMolStructureResult {
    const [mols, setMols] = useState<MolListEntry[]>([]);
    const [selectedMolId, setSelectedMolIdState] = useState<number | undefined>(undefined);
    const [chains, setChains] = useState<MolChainEntry[]>([]);
    const [molsLoading, setMolsLoading] = useState(false);
    const [chainsLoading, setChainsLoading] = useState(false);

    // Latest sceneId / selectedMolId in refs so the refetch identity stays
    // stable across renders (otherwise the event subscription added in
    // Phase 2 would resubscribe per render).
    const sceneIdRef = useRef<number | undefined>(sceneId);
    sceneIdRef.current = sceneId;
    const selectedMolIdRef = useRef<number | undefined>(selectedMolId);
    selectedMolIdRef.current = selectedMolId;

    const setSelectedMolId = useCallback((uid: number | undefined) => {
        setSelectedMolIdState(uid);
    }, []);

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
                // If the current selection is gone, fall back to the first
                // entry (or clear when the scene has no mol objects).
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

    // Subscribe to SEM_OBJECT events so the panel auto-refreshes when
    // objects are added / removed / renamed (PDB load) or topology
    // changes mid-session. Mirrors UXP `panel.molstruct.onLoad`
    // `addListener("topologyChanged", SEM_OBJECT, SEM_CHANGED, -1, ...)`
    // plus the implicit ObjMenuList rebind on SEM_OBJECT ADDED/REMOVING.
    // Debounced so a PDB-load burst yields one refetch pair.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: SEM_OBJECT,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: refetch,
        debounceMs: 30,
    });

    return {
        mols,
        selectedMolId,
        setSelectedMolId,
        chains,
        loading: molsLoading || chainsLoading,
        refetch,
    };
}
