/**
 * @file hooks/react/useRealtimeDragProp.ts
 * @description Wiring helper that connects a `DragNumericField` to an object
 * property, with an optional realtime (live-while-dragging) feedback mode.
 *
 * It owns the field's local `draft` and the drag lifecycle, and returns the
 * props to spread onto `DragNumericField`. The actual object writes are left to
 * the caller via three callbacks so the same hook serves both the inspector
 * (`setGenericProp`) and the density-map panel (`setMapRendererProp`):
 *   - `onPreview(value)` -- live-apply WITHOUT undo (called every drag frame
 *     when `realtime`); the 3D view redraws but nothing is recorded for undo.
 *   - `onCommit(original, value)` -- push a single undo step on release; the
 *     worker restores `original` first so the recorded step is
 *     `original -> value` rather than `lastPreview -> value`.
 *   - `onAbort(original)` -- restore the object to `original` (a realtime drag
 *     was cancelled). Not called without `realtime`: nothing was previewed, so
 *     the object is still at `original` and a write would be a round trip that
 *     changes nothing.
 *
 * While idle, the field tracks the committed value (so external changes -- undo,
 * scripts -- sync in). While dragging, the committed value is ignored so a
 * debounced refetch that reflects an in-flight preview cannot reset the draft.
 *
 * Previews are coalesced: at most one is in flight; if newer drag frames arrive
 * while one is pending, only the latest is sent when it resolves. This bounds
 * worker traffic to the worker's own throughput regardless of mouse rate.
 *
 * @module hooks/useRealtimeDragProp
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseRealtimeDragPropOptions {
    /** Committed object value in display units; the field resyncs to it when idle. */
    committed: number
    /**
     * The prop's default flag at drag start, frozen alongside `committed`. The
     * commit / abort restore needs the pre-drag default state because a preview
     * frame permanently flips the prop to non-default; passing it through lets
     * the worker restore via `resetProp` (flag + value) instead of a bare value
     * write, so undo correctly reverts the default state too.
     */
    committedIsDefault?: boolean
    /** Enable live preview during a drag (still one undo step on release). */
    realtime?: boolean
    /**
     * Bump to re-mirror `committed` into the field while idle. A rejected
     * commit leaves `committed` numerically unchanged, so without this the
     * field would keep showing the value the object never took.
     */
    resyncKey?: unknown
    /** Live-apply a value to the object without undo (called every drag frame). */
    onPreview: (value: number) => void | Promise<unknown>
    /**
     * Commit a single undo step. `original` is the pre-interaction value and
     * `wasDefault` its pre-interaction default flag.
     */
    onCommit: (original: number, value: number, wasDefault: boolean) => void
    /** Restore the object to `original` (and its `wasDefault` state) on cancel. */
    onAbort?: (original: number, wasDefault: boolean) => void
}

export interface RealtimeDragProps {
    value: number
    realtime: boolean
    onChange: (value: number) => void
    onDragStart: () => void
    onRelease: (value: number) => void
    onDragCancel: () => void
}

/**
 * Build the `DragNumericField` props for an object property with optional
 * realtime feedback. See the file header for the callback contract.
 */
export function useRealtimeDragProp(
    opts: UseRealtimeDragPropOptions,
): RealtimeDragProps {
    const { committed, realtime = false, resyncKey } = opts

    const [draft, setDraft] = useState(committed)

    // Latest committed value and callbacks, kept in refs so the returned
    // handlers stay stable and always reach current behavior.
    const committedRef = useRef(committed)
    committedRef.current = committed
    const committedIsDefaultRef = useRef(opts.committedIsDefault ?? false)
    committedIsDefaultRef.current = opts.committedIsDefault ?? false
    const realtimeRef = useRef(realtime)
    realtimeRef.current = realtime
    const cbRef = useRef(opts)
    cbRef.current = opts

    const draggingRef = useRef(false)
    /** Pre-drag value, frozen on drag start; rollback / commit anchor. */
    const originalRef = useRef(committed)
    /** Pre-drag default flag, frozen on drag start; paired with `originalRef`. */
    const originalIsDefaultRef = useRef(committedIsDefaultRef.current)

    // Preview coalescing state.
    const inFlightRef = useRef(false)
    const pendingRef = useRef<number | null>(null)

    const sendPreview = useCallback((value: number) => {
        if (inFlightRef.current) {
            pendingRef.current = value
            return
        }
        inFlightRef.current = true
        pendingRef.current = null
        Promise.resolve(cbRef.current.onPreview(value)).finally(() => {
            inFlightRef.current = false
            const next = pendingRef.current
            pendingRef.current = null
            // Only chain the next frame while still dragging, so a coalesced
            // value can never land after the release commit.
            if (draggingRef.current && next !== null) sendPreview(next)
        })
    }, [])

    // While idle, mirror the committed value into the draft. While dragging,
    // leave the draft alone (a debounced refetch may reflect a preview).
    useEffect(() => {
        if (!draggingRef.current) setDraft(committed)
    }, [committed, resyncKey])

    const onChange = useCallback((v: number) => {
        setDraft(v)
        if (realtimeRef.current && draggingRef.current) sendPreview(v)
    }, [sendPreview])

    const onDragStart = useCallback(() => {
        draggingRef.current = true
        originalRef.current = committedRef.current
        originalIsDefaultRef.current = committedIsDefaultRef.current
        pendingRef.current = null
    }, [])

    const onRelease = useCallback((v: number) => {
        const wasDrag = draggingRef.current
        draggingRef.current = false
        pendingRef.current = null
        // For a drag, anchor on the frozen pre-drag value / flag; for an arrow /
        // text commit (no drag), the object is still at the committed value.
        const original = wasDrag ? originalRef.current : committedRef.current
        const wasDefault = wasDrag
            ? originalIsDefaultRef.current
            : committedIsDefaultRef.current
        cbRef.current.onCommit(original, v, wasDefault)
    }, [])

    const onDragCancel = useCallback(() => {
        const wasDrag = draggingRef.current
        const wasRealtime = realtimeRef.current
        draggingRef.current = false
        pendingRef.current = null
        // A run that was never announced (a single-shot step abandoned by an
        // unmount) previewed nothing, so the object is still at the committed
        // value and `originalRef` belongs to an earlier gesture.
        const original = wasDrag ? originalRef.current : committedRef.current
        setDraft(original)
        // Only an announced realtime drag moved the object; anything else never
        // left `original`, so there is nothing to restore.
        if (wasRealtime && wasDrag) cbRef.current.onAbort?.(original, originalIsDefaultRef.current)
    }, [])

    return { value: draft, realtime, onChange, onDragStart, onRelease, onDragCancel }
}
