/**
 * @file features/molview/useViewXform.ts
 * @description Live data source for `ViewPane`'s camera-transform controls
 * (zoom, slab, view distance, view center) and incremental rotation. Mirrors
 * the UXP `fakedial-panel` data flow.
 *
 * Fetches `getViewXform` for the active view and auto-refetches on SEM_VIEW
 * property-change events (mouse navigation, scripts, other panels) so the
 * absolute fields stay live (UXP `_attachView` parity). Mutations apply
 * optimistically to local state and round-trip through `setViewXform` /
 * `rotateView`; the trailing event refetch reconciles any worker-side clamp.
 *
 * Rotation has no absolute scalar -- `rotate(axis, deltaDeg)` applies a
 * relative `rotateView`; the accumulator shown in the field is owned by the
 * caller (see ADR-0025). Translation likewise has a relative path:
 * `translate(axis, delta, dragging)` applies a camera-relative pan
 * (`translateView`) and mirrors the returned absolute center back into all
 * three center fields (a single-axis pan couples x/y/z), matching the UXP
 * fakedial wheel while the displayed values stay the absolute center.
 *
 * `beginInteraction` / `endInteraction` gate the event-driven refetch: while a
 * field drag is in progress the local optimistic value is authoritative, so
 * the self-fired PROPCHG bursts are ignored to avoid jitter; the final
 * `endInteraction` refetch syncs the clamped truth.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { SetViewXformArgs } from '@renderer/worker/server/services/view/viewXform'
import { SEM_VIEW, SEM_ANY } from '@renderer/event'
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener'

/** Mutable fields of `setViewXform` (everything except the target view id). */
type ViewXformPatch = Omit<SetViewXformArgs, 'viewId'>

export interface ViewXformState {
    zoom: number
    slab: number
    distance: number
    centerX: number
    centerY: number
    centerZ: number
}

export interface UseViewXformOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    viewId: number | undefined
}

export type CenterAxis = 'x' | 'y' | 'z'

export interface UseViewXformResult {
    state: ViewXformState | null
    setZoom: (v: number) => void
    setSlab: (v: number) => void
    setDistance: (v: number) => void
    setCenter: (axis: CenterAxis, v: number) => void
    /** Apply a relative rotation (degrees) about a single view axis. */
    rotate: (axis: CenterAxis, deltaDeg: number) => void
    /**
     * Apply a camera-relative pan along a single screen axis (UXP fakedial
     * `translateView`). `delta` is the screen-space pan amount; the worker
     * returns the resulting absolute center (which couples all three axes), so
     * every center field stays live. `dragging` selects the transient drag
     * event vs the committing one.
     */
    translate: (axis: CenterAxis, delta: number, dragging: boolean) => void
    /** Suppress event-driven refetch while a field drag is in progress. */
    beginInteraction: () => void
    /** Re-enable refetch and reconcile against the (clamped) worker truth. */
    endInteraction: () => void
}

export function useViewXform(opts: UseViewXformOptions): UseViewXformResult {
    const { cm, sceneId, viewId } = opts
    const [state, setState] = useState<ViewXformState | null>(null)

    // Latest state / viewId in refs so the event handler and setters read
    // current values without re-subscribing or stale closures.
    const stateRef = useRef<ViewXformState | null>(state)
    stateRef.current = state
    const viewIdRef = useRef(viewId)
    viewIdRef.current = viewId
    const draggingRef = useRef(false)
    const fetchToken = useRef(0)

    const fetchState = useCallback((): void => {
        const vid = viewIdRef.current
        if (!cm || vid === undefined) {
            setState(null)
            return
        }
        const token = ++fetchToken.current
        cm.invokeService('getViewXform', { viewId: vid })
            .then((res) => {
                if (token !== fetchToken.current) return
                if (!res?.ok) {
                    setState(null)
                    return
                }
                setState({
                    zoom: res.zoom,
                    slab: res.slab,
                    distance: res.distance,
                    centerX: res.centerX,
                    centerY: res.centerY,
                    centerZ: res.centerZ,
                })
            })
            .catch((err: unknown) => {
                if (token !== fetchToken.current) return
                console.warn('getViewXform failed:', err)
                setState(null)
            })
    }, [cm])

    // Re-fetch when the active view changes.
    useEffect(() => {
        fetchState()
    }, [cm, viewId, fetchState])

    // Live sync: SEM_VIEW property changes (zoom / slab / distance / center /
    // setCamera) from mouse navigation, scripts, or other panels. Skipped
    // mid-drag (local optimistic value wins) to avoid feedback jitter.
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined && viewId !== undefined,
        category: '',
        srcMask: SEM_VIEW,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: () => {
            if (draggingRef.current) return
            fetchState()
        },
        debounceMs: 30,
    })

    const applyAbsolute = useCallback(
        (patch: Partial<ViewXformState>, args: ViewXformPatch): void => {
            const vid = viewIdRef.current
            const cur = stateRef.current
            if (cur) setState({ ...cur, ...patch })
            if (!cm || vid === undefined) return
            cm.invokeService('setViewXform', { viewId: vid, ...args }).catch((err: unknown) => {
                console.warn('setViewXform failed:', err)
            })
        },
        [cm],
    )

    const setZoom = useCallback((v: number) => applyAbsolute({ zoom: v }, { zoom: v }), [applyAbsolute])
    const setSlab = useCallback((v: number) => applyAbsolute({ slab: v }, { slab: v }), [applyAbsolute])
    const setDistance = useCallback(
        (v: number) => applyAbsolute({ distance: v }, { distance: v }),
        [applyAbsolute],
    )

    const setCenter = useCallback(
        (axis: CenterAxis, v: number) => {
            const cur = stateRef.current
            if (!cur) return
            const center = { x: cur.centerX, y: cur.centerY, z: cur.centerZ }
            center[axis] = v
            const patch =
                axis === 'x' ? { centerX: v } : axis === 'y' ? { centerY: v } : { centerZ: v }
            applyAbsolute(patch, { center })
        },
        [applyAbsolute],
    )

    const rotate = useCallback(
        (axis: CenterAxis, deltaDeg: number) => {
            const vid = viewIdRef.current
            if (!cm || vid === undefined || deltaDeg === 0) return
            cm.invokeService('rotateView', {
                viewId: vid,
                rotX: axis === 'x' ? deltaDeg : 0,
                rotY: axis === 'y' ? deltaDeg : 0,
                rotZ: axis === 'z' ? deltaDeg : 0,
            }).catch((err: unknown) => {
                console.warn('rotateView failed:', err)
            })
        },
        [cm],
    )

    const translate = useCallback(
        (axis: CenterAxis, delta: number, dragging: boolean) => {
            const vid = viewIdRef.current
            if (!cm || vid === undefined || delta === 0) return
            cm.invokeService('translateView', {
                viewId: vid,
                dx: axis === 'x' ? delta : 0,
                dy: axis === 'y' ? delta : 0,
                dz: axis === 'z' ? delta : 0,
                dragging,
            })
                .then((res) => {
                    // A single-axis pan moves all three world-center components;
                    // mirror the worker truth so every field display follows.
                    // Ignore late responses after the drag ended -- the
                    // endInteraction refetch is authoritative there.
                    if (!res?.ok || !draggingRef.current) return
                    const cur = stateRef.current
                    if (cur)
                        setState({
                            ...cur,
                            centerX: res.centerX,
                            centerY: res.centerY,
                            centerZ: res.centerZ,
                        })
                })
                .catch((err: unknown) => {
                    console.warn('translateView failed:', err)
                })
        },
        [cm],
    )

    const beginInteraction = useCallback(() => {
        draggingRef.current = true
    }, [])
    const endInteraction = useCallback(() => {
        draggingRef.current = false
        fetchState()
    }, [fetchState])

    return {
        state,
        setZoom,
        setSlab,
        setDistance,
        setCenter,
        rotate,
        translate,
        beginInteraction,
        endInteraction,
    }
}
