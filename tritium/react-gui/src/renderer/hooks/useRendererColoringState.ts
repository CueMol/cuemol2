/**
 * @file hooks/useRendererColoringState.ts
 * @description Live coloring state (class + Paint entries / defaultcolor)
 * for the Coloring panel's deck content.
 *
 * Fetches via `getRendererColoringState` and refetches on SEM_RENDERER
 * PROPCHG events whose `propname` is `coloring` or `defaultcolor`. Other
 * property changes are ignored to avoid spurious refreshes during e.g.
 * visibility toggles.
 */

import { useRef } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type {
    ColoringTargetKind,
    GetRendererColoringStateResult,
} from '../worker/server/services/rendererColoring.service'
import { SEM_OBJECT, SEM_RENDERER, SEM_SCENE, SEM_ANY } from '../event'
import { useLiveFetch } from '@renderer/hooks/cuemol/useLiveFetch'
import { EVENT_BURST_DEBOUNCE_MS } from '@renderer/utils/timing'

// Listen for renderer events when editing a renderer's coloring and for
// object events when editing an object's coloring. Combining the masks
// keeps the subscription wire identical regardless of target kind.
// SEM_SCENE covers the bulk-load path (sceneLoaded after a slow qsc load,
// which fires no per-renderer events) -- scene events carry no propname so
// they pass the refetch filter below.
const COLORING_EVENT_MASK = SEM_OBJECT | SEM_RENDERER | SEM_SCENE

/**
 * Renderer-level props that the Elepot / Multi-gradient decks read.
 * PROPCHG events for these surface with the propname matching the
 * renderer's own field (not "coloring"), so the filter has to allow them
 * through. Kept in sync with `readElepotParams` + `paint-type-elepot` /
 * `paint-type-multigrad` mutation sets in `rendererColoring.service.ts`.
 */
const DECK_REFETCH_PROPS = new Set<string>([
    'colormode',
    'elepot',
    'ramp_above',
    'lowcol', 'midcol', 'highcol',
    'lowpar', 'midpar', 'highpar',
    // Multi-gradient deck: gradient nodes + color-map binding
    'multi_grad',
    'color_mapname',
    // MOLFANC (molecule colormode): reference mol + atom-map selection
    'target',
    'sel',
])

export interface UseRendererColoringStateOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    rendId: number | null
    /** Default 'renderer' for back-compat with non-shell callers. */
    targetKind?: ColoringTargetKind
}

export interface UseRendererColoringStateResult {
    state: GetRendererColoringStateResult | null
    refetch: () => void
}

const EMPTY_STATE: GetRendererColoringStateResult = {
    ok: false,
    className: '',
    defaultColor: '',
    paintEntries: [],
    surfaceType: '',
    colormode: '',
    multiGradCapable: false,
    hasColoring: false,
}

/**
 * Fetch + auto-refresh the coloring state for a single renderer.
 *
 * Returns `null` until the first fetch resolves; subsequent state is the
 * worker's `getRendererColoringState` result. Auto-refetches on
 * `SEM_RENDERER` events scoped to the active scene.
 */
/**
 * Decide whether a CueMol event should trigger a coloring refetch.
 *
 * Coloring / defaultcolor PROPCHG, any ADDED / REMOVING event (no
 * propname), and the Elepot ramp props pass; other PROPCHG events are
 * ignored to avoid spurious refreshes (e.g. visibility toggles).
 *
 * For CPK / Rainbow / Bfac decks the C++ side fires the PROPCHG on the
 * parent renderer with `propname === "coloring"` because the change
 * happens to the renderer's coloring sub-object. For the Elepot deck the
 * eight ramp props live directly on the surface renderer, so the events
 * surface with their own propnames -- whitelist those too. `colormode` is
 * included because switching it (e.g. molecule -> potential) needs the
 * deck to re-route.
 *
 * @param args - the CueMol event payload.
 * @returns true if the deck should refetch.
 */
function shouldRefetchColoring(args: unknown): boolean {
    const payload = args as { obj?: { propname?: string } } | undefined
    const propname = payload?.obj?.propname
    if (propname === undefined) return true // ADDED / REMOVING
    return (
        propname === 'coloring' ||
        propname === 'defaultcolor' ||
        DECK_REFETCH_PROPS.has(propname) ||
        // nested multi_grad event names (e.g. "multi_grad.<child>")
        propname.startsWith('multi_grad')
    )
}

export function useRendererColoringState({
    cm,
    sceneId,
    rendId,
    targetKind = 'renderer',
}: UseRendererColoringStateOptions): UseRendererColoringStateResult {
    const sceneIdRef = useRef<number | undefined>(sceneId)
    const rendIdRef = useRef<number | null>(rendId)
    const targetKindRef = useRef<ColoringTargetKind>(targetKind)
    sceneIdRef.current = sceneId
    rendIdRef.current = rendId
    targetKindRef.current = targetKind

    const { state, refetch } = useLiveFetch<GetRendererColoringStateResult | null>({
        cm,
        initial: null,
        fallback: null,
        fetch: () => {
            const sid = sceneIdRef.current
            const rid = rendIdRef.current
            const tk = targetKindRef.current
            if (!cm || sid === undefined || rid === null) return null
            return cm
                .invokeService('getRendererColoringState', {
                    sceneId: sid,
                    rendId: rid,
                    targetKind: tk,
                })
                .then((res) => res ?? EMPTY_STATE)
                .catch((err: unknown) => {
                    console.warn('getRendererColoringState failed:', err)
                    return EMPTY_STATE
                })
        },
        fetchDeps: [sceneId, rendId, targetKind],
        eventFilter: shouldRefetchColoring,
        listeners: [
            {
                enabled: sceneId !== undefined && rendId !== null,
                srcMask: COLORING_EVENT_MASK,
                evtMask: SEM_ANY,
                scopeId: sceneId ?? -1,
                debounceMs: EVENT_BURST_DEBOUNCE_MS,
            },
        ],
    })

    return { state, refetch }
}
