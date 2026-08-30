/**
 * @file features/sequence/useMolSequenceData.ts
 * @description Live data source for `SequencePanel`.
 *
 * Enumerates every MolCoord-like object in the active scene and bulk-
 * fetches their chains + residues in a single IPC round trip via
 * `getSeqPanelData`. UXP shows every mol simultaneously (no per-mol
 * selector); this hook mirrors that with one row per (mol, chain).
 *
 * ## Performance
 *
 * UXP's `seqpanel.js` re-fetches just one mol's residue data when its
 * `sel` property changes (`SEM_PROPCHG` handler scoped by `target_uid`)
 * and relies on synchronous C++ calls so the cost is one in-process
 * iteration. In tritium each C++ call would be a postMessage round
 * trip, so we:
 *
 *   - fold the per-mol / per-chain fan-out into a single worker-side
 *     loop (one IPC call per refresh, regardless of mol or chain
 *     count), and
 *   - on `SEM_PROPCHG sel` events, refetch only the affected mol's
 *     rows via the same service's `molIds` filter, then splice them
 *     into the existing rows array preserving row order.
 *
 * Full-scene refetches still happen on `SEM_OBJECT` add/remove,
 * `topologyChanged`, and `SEM_SCENE` (sceneLoaded / sceneAllCleared).
 *
 * Mirrors UXP `bottom-panels/seqpanel.js` `loadScene` /
 * `addMolData(target_uid)` / `removeMolData(target_uid)` and the
 * SEM_SCENE / SEM_OBJECT handlers (`sc_handler` / `ob_handler`).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { MolResidueEntry } from '@renderer/worker/server/services/select/getMolStructure'
import type { SeqPanelRow } from '@renderer/worker/server/services/select/getSeqPanelData'
import {
    SEM_OBJECT,
    SEM_SCENE,
    SEM_ADDED,
    SEM_REMOVING,
    SEM_PROPCHG,
    SEM_CHANGED,
    SEM_ANY,
} from '@renderer/event'
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener'

export interface UseMolSequenceDataOptions {
    cm: AsyncCueMol | null
    /** Active scene UID, or undefined when no scene is active. */
    sceneId: number | undefined
}

/**
 * One row of the sequence grid (a single chain of a single MolCoord).
 * Re-exported from the worker DTO so consumers don't import worker
 * types directly.
 */
export type SeqRow = SeqPanelRow

export interface UseMolSequenceDataResult {
    rows: SeqRow[]
    loading: boolean
    refetch: () => void
}

/**
 * Type guard for the cuemol event payload subset we read. The runtime
 * shape comes from the C++ `ScrEventManager` callback.
 */
interface CueMolEventArgs {
    evtType?: number
    method?: string
    obj?: {
        target_uid?: number
        propname?: string
    }
}

export function useMolSequenceData(
    opts: UseMolSequenceDataOptions,
): UseMolSequenceDataResult {
    const { cm, sceneId } = opts
    const [rows, setRows] = useState<SeqRow[]>([])
    const [loading, setLoading] = useState(false)

    // Stash sceneId so the event handler stays identity-stable (no
    // resubscribe on every render).
    const sceneIdRef = useRef(sceneId)
    sceneIdRef.current = sceneId
    // Bump on any fetch so older async resolves can detect supersession.
    const fetchTokenRef = useRef(0)

    const fetchAll = useCallback(() => {
        const sid = sceneIdRef.current
        if (!cm || sid === undefined) {
            setRows([])
            return
        }
        const token = ++fetchTokenRef.current
        setLoading(true)
        cm.invokeService('getSeqPanelData', { sceneId: sid })
            .then((res) => {
                if (token !== fetchTokenRef.current) return
                setRows(res?.rows ?? [])
            })
            .catch((err: unknown) => {
                if (token !== fetchTokenRef.current) return
                console.warn('getSeqPanelData failed:', err)
                setRows([])
            })
            .finally(() => {
                if (token === fetchTokenRef.current) setLoading(false)
            })
    }, [cm])

    /**
     * Surgical refresh: refetch only the rows belonging to `molUid`
     * and splice them back into the existing rows array preserving
     * order. Used by SEM_PROPCHG sel where the rest of the scene's
     * residue data is unchanged. Bumps the token so a concurrent
     * fetchAll still wins.
     */
    const refetchMolRows = useCallback(
        (molUid: number) => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return
            const token = ++fetchTokenRef.current
            cm.invokeService('getSeqPanelData', { sceneId: sid, molIds: [molUid] })
                .then((res) => {
                    if (token !== fetchTokenRef.current) return
                    const fresh = res?.rows ?? []
                    setRows((prev) => {
                        const byKey = new Map<string, SeqRow>()
                        for (const r of fresh) byKey.set(`${r.molUid}:${r.chainName}`, r)
                        const keptSeen = new Set<string>()
                        const next: SeqRow[] = []
                        for (const r of prev) {
                            if (r.molUid !== molUid) {
                                next.push(r)
                                continue
                            }
                            const k = `${r.molUid}:${r.chainName}`
                            const updated = byKey.get(k)
                            if (updated) {
                                next.push(updated)
                                keptSeen.add(k)
                            }
                            // Drop a row that no longer exists (e.g.
                            // chain removed under us).
                        }
                        // Append any chains that are new since the last
                        // full fetch (rare; topologyChanged usually
                        // arrives separately).
                        for (const r of fresh) {
                            const k = `${r.molUid}:${r.chainName}`
                            if (!keptSeen.has(k) && !prev.some((p) => p.molUid === molUid && p.chainName === r.chainName)) {
                                next.push(r)
                            }
                        }
                        return next
                    })
                })
                .catch((err: unknown) => {
                    if (token !== fetchTokenRef.current) return
                    console.warn(`getSeqPanelData(molIds=[${molUid}]) failed:`, err)
                })
        },
        [cm],
    )

    // Initial / scene-change fetch.
    useEffect(() => {
        fetchAll()
    }, [cm, sceneId, fetchAll])

    // SEM_OBJECT handler -- UXP `ob_handler` parity. Sel toggle is the
    // hot path and gets surgical per-mol refresh; structural changes
    // (ADDED / REMOVING / topologyChanged) trigger a full refetch.
    const handleObjectEvent = useCallback(
        (rawArgs: unknown) => {
            const args = rawArgs as CueMolEventArgs
            const evt = args?.evtType
            const targetUid = args?.obj?.target_uid

            if (evt === SEM_PROPCHG) {
                if (args.obj?.propname === 'sel' && typeof targetUid === 'number') {
                    refetchMolRows(targetUid)
                }
                // Other prop changes (visible / name / locked / ...) do
                // not affect what the seq panel displays.
                return
            }
            if (evt === SEM_ADDED || evt === SEM_REMOVING) {
                fetchAll()
                return
            }
            if (evt === SEM_CHANGED && args?.method === 'topologyChanged') {
                fetchAll()
            }
        },
        [fetchAll, refetchMolRows],
    )

    // Subscribe to SEM_OBJECT. No debounce here -- sel toggles must
    // feel snappy; bursts during paste/undo coalesce naturally because
    // they fire many ADDED/REMOVING which all dispatch to fetchAll
    // (the token guard prevents redundant setRows).
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: SEM_OBJECT,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: handleObjectEvent,
    })

    // UXP `sc_handler`: SEM_SCENE sceneLoaded / sceneAllCleared -- the
    // mol list may have churned wholesale, refetch everything.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: SEM_SCENE,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: fetchAll,
        debounceMs: 30,
    })

    return { rows, loading, refetch: fetchAll }
}

// Re-export `MolResidueEntry` for downstream consumers that destructure
// `row.residues` and want a typed view of each element.
export type { MolResidueEntry }
