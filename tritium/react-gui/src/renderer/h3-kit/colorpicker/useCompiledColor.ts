/**
 * @file h3-kit/colorpicker/useCompiledColor.ts
 * @description Resolve a CueMol colour string to RGB through the worker, so a
 * swatch shows the colour C++ would actually paint.
 *
 * Every colour the UI shows is a string the StyleManager owns the meaning of
 * -- `#0088ff`, `salmon`, `hsb(210, 0.8, 1.0)`, `$molcol` -- and only the
 * `compileColor` service can turn one into pixels the same way the renderer
 * does. Anything that draws a swatch needs this, which is why it is a hook and
 * not private to the picker.
 *
 * The live RGB is returned with its setter: a slider drag paints from the
 * value under the user's finger, ahead of any round trip, and the next `value`
 * change puts the authoritative answer back.
 */

import { useEffect, useState } from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { CompileColorResult } from '@renderer/worker/server/services/colorPicker.service'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'
import type { Rgb } from './colorMath'

export interface UseCompiledColorResult {
    /** Full service answer (in-gamut flag, device RGB), or null when unresolved. */
    resolved: CompileColorResult | null
    /** RGB to paint with, or null when the string does not resolve. */
    liveRgb: Rgb | null
    /** Paint from a local value during a drag; the next fetch overwrites it. */
    setLiveRgb: (rgb: Rgb | null) => void
}

/**
 * Compile `value` into RGB whenever it (or the scene it is read against)
 * changes.
 *
 * @param cm - worker bridge; null resolves to nothing.
 * @param value - CueMol colour string.
 * @param sceneId - scene the string is resolved against (named colours and
 *   `$molcol` are scene-scoped).
 */
export function useCompiledColor(
    cm: AsyncCueMol | null,
    value: string,
    sceneId: number | undefined,
): UseCompiledColorResult {
    const [resolved, setResolved] = useState<CompileColorResult | null>(null)
    const [liveRgb, setLiveRgb] = useState<Rgb | null>(null)
    const guard = useStaleGuard()

    useEffect(() => {
        const token = guard.next()
        if (!cm) {
            setResolved(null)
            setLiveRgb(null)
            return
        }
        ;(async () => {
            try {
                const res = await cm.invokeService('compileColor', {
                    colorStr: value,
                    sceneId: sceneId ?? 0,
                })
                if (!guard.isCurrent(token)) return
                setResolved(res ?? null)
                setLiveRgb(res?.ok && res.r !== undefined ? [res.r, res.g!, res.b!] : null)
            } catch (err: unknown) {
                if (!guard.isCurrent(token)) return
                console.warn('compileColor failed:', err)
                setResolved(null)
                setLiveRgb(null)
            }
        })()
        return () => guard.invalidate()
    }, [value, sceneId, cm, guard])

    return { resolved, liveRgb, setLiveRgb }
}
