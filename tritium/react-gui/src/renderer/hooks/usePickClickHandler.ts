/**
 * @file hooks/usePickClickHandler.ts
 * @description Shared scaffold for the single-button "pick on left-click"
 * tools (measure distance/angle/torsion, bond editor). Both tools have a
 * near-identical handler:
 *   - subscribe to the C++ `mouseClicked` event scoped to the active view,
 *   - gate on the INDEV_LBTN modifier bit,
 *   - forward the pick to a worker service,
 *   - reset the in-progress pick sequence on cleanup (tool / view change),
 *   - reset on Escape while active.
 *
 * The navigate tool is NOT built on this scaffold: it has a double-click
 * branch, an RBTN context-menu branch, and dedicated AsyncCueMol methods.
 * It only shares the click decode + bit constants (`decodeClick` /
 * `INDEV_LBTN`).
 */
import { useEffect } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener'
import * as event from '../event'
import { decodeClick, INDEV_LBTN } from '../worker/shared/inDevModif'

/** Result shape every pick service returns (extra fields are tool-specific). */
export interface PickServiceResult {
    statusMessage?: string
}

/** Result shape every reset service returns. */
export interface ResetServiceResult {
    cleared?: boolean
}

export interface UsePickClickHandlerArgs {
    cm: AsyncCueMol | null
    /** True while this tool owns the click (its tool is active + view ready). */
    enabled: boolean
    /** Active view uid, or -1 when none. */
    viewId: number
    /** Push a status-bar message (or null to clear). */
    setStatusMessage: (msg: string | null) => void
    /**
     * Run the worker-side pick for a left-click at `(x, y)` in the active
     * view. Returns the service result (its `statusMessage` is surfaced).
     */
    pick: (x: number, y: number) => Promise<PickServiceResult | null | undefined>
    /**
     * Reset the in-progress pick sequence (cleanup / Escape). Returns the
     * reset result (`cleared` gates the Escape status message).
     */
    reset: () => Promise<ResetServiceResult | null | undefined>
    /** Status message shown when Escape clears an in-progress pick. */
    escapeMessage: string
}

/**
 * Wire a left-click pick tool: subscribe to `mouseClicked`, forward
 * LBTN clicks to `pick`, and reset on cleanup / Escape.
 *
 * @remarks The cleanup runs whenever `enabled` / `viewId` change, so a
 * stale first pick can never combine with a later one across a tool or
 * view switch. The worker is the source of truth for the pick buffer.
 */
export function usePickClickHandler({
    cm,
    enabled,
    viewId,
    setStatusMessage,
    pick,
    reset,
    escapeMessage,
}: UsePickClickHandlerArgs): void {
    useCueMolEventListener({
        cm,
        enabled,
        category: 'mouseClicked',
        srcMask: event.SEM_INDEV,
        evtMask: event.SEM_ANY,
        scopeId: viewId,
        handler: async (args) => {
            if (!cm || !enabled) return
            const click = decodeClick(args)
            if (!click) return
            if (!(click.mod & INDEV_LBTN)) return
            try {
                const result = await pick(click.x, click.y)
                if (result?.statusMessage) setStatusMessage(result.statusMessage)
            } catch (err) {
                // useCueMolEventListener discards the promise this handler
                // returns, so nothing else can catch this. Picking an object
                // that was deleted between the click and the dispatch is an
                // ordinary outcome, not a crash.
                console.warn('pick failed:', err)
            }
        },
    })

    // Cancel any in-progress pick sequence when leaving the tool or
    // switching the active view.
    useEffect(() => {
        if (!cm || !enabled) return
        return () => {
            reset().catch((err: unknown) => console.warn('pick reset failed:', err))
        }
        // `reset` identity is stable per (cm, viewId); deps mirror the
        // original per-tool cleanup gating.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cm, enabled, viewId])

    // Escape cancels the current pick while the tool is active.
    useEffect(() => {
        if (!cm || !enabled) return
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            reset()
                .then((r) => {
                    if (r?.cleared) setStatusMessage(escapeMessage)
                })
                .catch((err: unknown) => console.warn('pick reset failed:', err))
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cm, enabled, viewId, setStatusMessage])
}
