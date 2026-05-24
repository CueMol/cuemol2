/**
 * @file hooks/useSymmetryPanel.ts
 * @description Live data source for `SymmetryPane`'s crystal info
 * readout.
 *
 * Scoped to a single `objId` chosen externally (typically by an
 * `ObjectSelect` widget driving local React state). The hook
 * fetches `getSymmetryPanelInfo` on the active object and
 * auto-refreshes when CueMol fires SEM_OBJECT events that may have
 * touched its CrystalInfo (UXP `addObjChgListener("crystalinfo")`
 * parity).
 *
 * Object enumeration (the dropdown) lives in `ObjectSelect`; this
 * hook only concerns itself with the info / button-enable flags for
 * the selected object.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type {
    SymmetryInfo,
    GetSymmetryPanelInfoResult,
} from '../worker/server/services/symmetryPanelOps.service'
import {
    SEM_OBJECT,
    SEM_SCENE,
    SEM_ANY,
} from '../event'
import { useCueMolEventListener } from './useCueMolEventListener'

export interface UseSymmetryPanelOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    /** Currently-selected object uid (e.g. from `ObjectSelect`). */
    objId: number | undefined
}

export interface UseSymmetryPanelResult {
    info: SymmetryInfo | null
    /** True iff selected object has CrystalInfo attached. */
    hasInfo: boolean
    /** True iff selected object is MolCoord-like. */
    isMol: boolean
    /** True iff cell dimensions are large enough to render. */
    cellOk: boolean
    /** True iff the selector currently resolves to a real C++ object. */
    objectExists: boolean
    refetch: () => void
}

const EMPTY_INFO_RESULT: GetSymmetryPanelInfoResult = {
    info: null,
    objectExists: false,
    hasInfo: false,
    isMol: false,
    cellOk: false,
}

export function useSymmetryPanel(opts: UseSymmetryPanelOptions): UseSymmetryPanelResult {
    const { cm, sceneId, objId } = opts
    const [infoResult, setInfoResult] = useState<GetSymmetryPanelInfoResult>(EMPTY_INFO_RESULT)

    // Keep latest sceneId / objId in refs so event-driven refetches
    // don't force resubscribe.
    const sceneIdRef = useRef(sceneId)
    sceneIdRef.current = sceneId
    const objIdRef = useRef(objId)
    objIdRef.current = objId

    const infoToken = useRef(0)

    const fetchInfo = useCallback((): void => {
        const sid = sceneIdRef.current
        const oid = objIdRef.current
        if (!cm || sid === undefined || oid === undefined) {
            setInfoResult(EMPTY_INFO_RESULT)
            return
        }
        const token = ++infoToken.current
        cm.invokeService('getSymmetryPanelInfo', { sceneId: sid, objId: oid })
            .then((res) => {
                if (token !== infoToken.current) return
                setInfoResult(res ?? EMPTY_INFO_RESULT)
            })
            .catch((err: unknown) => {
                if (token !== infoToken.current) return
                console.warn('getSymmetryPanelInfo failed:', err)
                setInfoResult(EMPTY_INFO_RESULT)
            })
    }, [cm])

    // Re-fetch when the active object (or scene) changes.
    useEffect(() => {
        fetchInfo()
    }, [cm, sceneId, objId, fetchInfo])

    // Refetch on SEM_OBJECT events (CrystalInfo / property changes).
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined && objId !== undefined,
        category: '',
        srcMask: SEM_OBJECT,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: fetchInfo,
        debounceMs: 30,
    })

    // Scene-wide events (load / clear) -- the object may have churned.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: SEM_SCENE,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: fetchInfo,
        debounceMs: 30,
    })

    return {
        info: infoResult.info,
        hasInfo: infoResult.hasInfo,
        isMol: infoResult.isMol,
        cellOk: infoResult.cellOk,
        objectExists: infoResult.objectExists,
        refetch: fetchInfo,
    }
}
