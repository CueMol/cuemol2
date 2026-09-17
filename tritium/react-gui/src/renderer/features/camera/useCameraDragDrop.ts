/**
 * @file features/camera/useCameraDragDrop.ts
 * @description Reordering the camera rows by dragging one between two others.
 *
 * A flat list needs far less than the scene tree's drop planner: there is no
 * hierarchy, so a drop is "before" or "after" the row under the pointer, and
 * the new order is computed whole and sent as one list. As in the tree, the
 * drop indicator only appears where the drop would actually change something,
 * so what the user sees and what the drop does cannot disagree.
 *
 * One row can be pinned to the top (`__current`). It cannot be dragged, and
 * nothing can be dropped above it -- the plan resolves a "before" on it to an
 * "after", so the indicator is drawn where the row will really land.
 *
 * The empty space below the rows is a drop target too, meaning "put it last".
 * Without that, reaching the end of the list required hitting the lower half
 * of the last row and anything past it was refused, which is not what dragging
 * to the bottom of a list does anywhere else.
 */

import { useCallback, useRef, useState } from 'react'

/** Drag payload: the dragged camera's name. */
export const CAMERA_MIME = 'application/x-cuemol-camera'

export type DropSide = 'before' | 'after'

/**
 * The order after dropping `src` on `tgt`, or null when the drop is a no-op
 * (dropping a row on itself, or back where it already was).
 */
export function planCameraReorder(
    names: readonly string[],
    src: string,
    tgt: string,
    side: DropSide,
    pinned?: string,
): string[] | null {
    if (src === tgt) return null
    // The pinned row keeps the top: it cannot move, and nothing goes above it.
    if (src === pinned) return null
    const effSide = tgt === pinned ? 'after' : side
    const rest = names.filter((n) => n !== src)
    let at = rest.indexOf(tgt)
    if (at < 0) return null
    if (effSide === 'after') at += 1
    const next = [...rest.slice(0, at), src, ...rest.slice(at)]
    if (next.length === names.length && next.every((n, i) => n === names[i])) return null
    return next
}

/**
 * The order after dropping `src` past the end of the list, or null when it is
 * already last (or is the pinned row, which does not move).
 */
export function planCameraDropAtEnd(
    names: readonly string[],
    src: string,
    pinned?: string,
): string[] | null {
    if (src === pinned) return null
    if (!names.includes(src)) return null
    if (names[names.length - 1] === src) return null
    return [...names.filter((n) => n !== src), src]
}

export interface CameraDropIndicator {
    name: string
    side: DropSide
}

export interface UseCameraDragDropOptions {
    /** Row names, top to bottom. */
    names: readonly string[]
    /** Commit an accepted reorder with the complete new order. */
    onReorder: (names: string[]) => unknown
    /** Row fixed at the top: not draggable, and nothing drops above it. */
    pinned?: string
    /** False while a row is being renamed (the editor owns the pointer). */
    enabled?: boolean
}

export interface CameraDragDrop {
    indicator: CameraDropIndicator | null
    onDragStart: (e: React.DragEvent, name: string) => void
    onDragOver: (e: React.DragEvent, name: string) => void
    onDrop: (e: React.DragEvent, name: string) => void
    onDragEnd: () => void
    /** On the list container: the empty space below the rows means "last". */
    onListDragOver: (e: React.DragEvent) => void
    onListDrop: (e: React.DragEvent) => void
    /** Clear the indicator when the pointer leaves the list. */
    onListDragLeave: (e: React.DragEvent) => void
}

export function useCameraDragDrop({
    names,
    onReorder,
    pinned,
    enabled = true,
}: UseCameraDragDropOptions): CameraDragDrop {
    const [indicator, setIndicator] = useState<CameraDropIndicator | null>(null)
    // dataTransfer.getData is unreadable during dragover, so the source is
    // also kept here (same reason as the scene tree's dragSourceRef).
    const srcRef = useRef<string | null>(null)

    const sideOf = useCallback((e: React.DragEvent, el: Element): DropSide => {
        const r = el.getBoundingClientRect()
        return e.clientY < r.top + r.height / 2 ? 'before' : 'after'
    }, [])

    const reset = useCallback(() => {
        srcRef.current = null
        setIndicator(null)
    }, [])

    const onDragStart = useCallback(
        (e: React.DragEvent, name: string) => {
            if (!enabled || name === pinned) {
                e.preventDefault()
                return
            }
            srcRef.current = name
            e.dataTransfer.setData(CAMERA_MIME, name)
            e.dataTransfer.effectAllowed = 'move'
            // Say explicitly that the row is what is being dragged. Left to
            // itself the browser picks the drag image, and what it picked was
            // whatever text happened to be selected under the pointer.
            const row = e.currentTarget
            if (row instanceof HTMLElement) {
                const r = row.getBoundingClientRect()
                e.dataTransfer.setDragImage(row, e.clientX - r.left, e.clientY - r.top)
            }
        },
        [enabled, pinned],
    )

    const onDragOver = useCallback(
        (e: React.DragEvent, name: string) => {
            const src = srcRef.current
            if (!enabled || !src) return
            // Without preventDefault the browser refuses the drop outright.
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            const side = sideOf(e, e.currentTarget)
            const accepted = planCameraReorder(names, src, name, side, pinned) !== null
            // Show the indicator where the row will land, which for the pinned
            // row is always below it.
            const shown = name === pinned ? 'after' : side
            setIndicator((prev) => {
                if (!accepted) return prev === null ? prev : null
                if (prev?.name === name && prev.side === shown) return prev
                return { name, side: shown }
            })
        },
        [enabled, names, pinned, sideOf],
    )

    const onDrop = useCallback(
        (e: React.DragEvent, name: string) => {
            const src = e.dataTransfer.getData(CAMERA_MIME) || srcRef.current
            const side = sideOf(e, e.currentTarget)
            reset()
            if (!enabled || !src) return
            e.preventDefault()
            const plan = planCameraReorder(names, src, name, side, pinned)
            if (plan) void onReorder(plan)
        },
        [enabled, names, onReorder, pinned, reset, sideOf],
    )

    /** True when the event came from a row, which owns its own handling. */
    const overRow = (e: React.DragEvent): boolean =>
        e.target instanceof Element && e.target.closest('[data-camera-name]') !== null

    const onListDragOver = useCallback(
        (e: React.DragEvent) => {
            const src = srcRef.current
            if (!enabled || !src || overRow(e)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            const last = names[names.length - 1]
            const accepted = last !== undefined && planCameraDropAtEnd(names, src, pinned) !== null
            setIndicator((prev) => {
                if (!accepted) return prev === null ? prev : null
                if (prev?.name === last && prev.side === 'after') return prev
                return { name: last, side: 'after' }
            })
        },
        [enabled, names, pinned],
    )

    const onListDrop = useCallback(
        (e: React.DragEvent) => {
            if (overRow(e)) return
            const src = e.dataTransfer.getData(CAMERA_MIME) || srcRef.current
            reset()
            if (!enabled || !src) return
            e.preventDefault()
            const plan = planCameraDropAtEnd(names, src, pinned)
            if (plan) void onReorder(plan)
        },
        [enabled, names, onReorder, pinned, reset],
    )

    const onListDragLeave = useCallback(
        (e: React.DragEvent) => {
            const to = e.relatedTarget
            if (to instanceof Node && e.currentTarget.contains(to)) return
            setIndicator(null)
        },
        [],
    )

    return {
        indicator,
        onDragStart,
        onDragOver,
        onDrop,
        onDragEnd: reset,
        onListDragOver,
        onListDrop,
        onListDragLeave,
    }
}
