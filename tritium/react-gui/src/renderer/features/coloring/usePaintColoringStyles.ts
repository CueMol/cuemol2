/**
 * @file features/coloring/usePaintColoringStyles.ts
 * @description Live list of the "Paint" coloring style presets -- the styles
 * whose name matches `/Paint$/` in the global (styleset 0) and scene-local
 * style sets. They back the Coloring panel's "Paint coloring" submenu, the
 * UXP `coloring-panel.js` `onPaintColShowing` ->
 * `cuemolui.populateStyleMenus(scene_uid, menu, /Paint$/, true)` list.
 *
 * The stock set (`data/default_style.xml`) is Default / Woody / Red / Orange /
 * Yellow / Green / Cyan / Blue / Purple; user styles saved into the scene's
 * style set join the same list, which is why this refetches on SEM_STYLE
 * instead of being a static table.
 */

import { useRef } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { PaintColoringStyleEntry } from '@renderer/worker/server/services/coloring/coloring.service'
import { SEM_STYLE, SEM_ANY } from '@renderer/event'
import { useLiveFetch } from '@renderer/hooks/cuemol/useLiveFetch'
import { EVENT_BURST_DEBOUNCE_MS } from '@renderer/utils/timing'

const EMPTY: PaintColoringStyleEntry[] = []

export interface UsePaintColoringStylesOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
}

export interface UsePaintColoringStylesResult {
    styles: PaintColoringStyleEntry[]
    refetch: () => void
}

/**
 * Fetch + auto-refresh the `*Paint` style presets of the active scene.
 *
 * Returns an empty array until the first fetch resolves. Refetches on a 30ms
 * debounce after style events so a newly saved user style shows up without a
 * panel remount.
 */
export function usePaintColoringStyles({
    cm,
    sceneId,
}: UsePaintColoringStylesOptions): UsePaintColoringStylesResult {
    const sceneIdRef = useRef<number | undefined>(sceneId)
    sceneIdRef.current = sceneId

    const { state: styles, refetch } = useLiveFetch<PaintColoringStyleEntry[]>({
        cm,
        initial: EMPTY,
        fallback: EMPTY,
        fetch: () => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return null
            return cm
                .invokeService('getPaintColoringStyles', { sceneId: sid })
                .then((res) => res?.entries ?? EMPTY)
                .catch((err: unknown) => {
                    console.warn('getPaintColoringStyles failed:', err)
                    return EMPTY
                })
        },
        fetchDeps: [sceneId],
        listeners: [
            {
                enabled: sceneId !== undefined,
                srcMask: SEM_STYLE,
                evtMask: SEM_ANY,
                scopeId: sceneId ?? -1,
                debounceMs: EVENT_BURST_DEBOUNCE_MS,
            },
        ],
    })

    return { styles, refetch }
}
