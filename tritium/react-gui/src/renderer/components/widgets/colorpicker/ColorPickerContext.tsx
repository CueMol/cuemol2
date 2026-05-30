/**
 * @file renderer/components/widgets/colorpicker/ColorPickerContext.tsx
 * @description Supplies the `cm` / `sceneId` pair that the ColorPicker widget
 * needs to resolve colours against the C++ StyleManager.
 *
 * Wrapping a subtree in `ColorPickerProvider` lets any `CueColorField` inside
 * it reach `cm` / `sceneId` without threading them through intermediate prop
 * layers (e.g. the inspector's `PropGroupedEditor` -> `renderPropEditor`
 * dispatcher). Scene-independent contexts (app settings) pass
 * `sceneId={undefined}`.
 */

import React, { createContext, useContext, useMemo } from 'react'
import type { AsyncCueMol } from '../../../worker/client/AsyncCueMol'

export interface ColorPickerCtx {
    cm: AsyncCueMol | null
    sceneId: number | undefined
}

const ColorPickerContext = createContext<ColorPickerCtx>({
    cm: null,
    sceneId: undefined,
})

/** Read the ambient `cm` / `sceneId` for colour resolution. */
export const useColorPickerCtx = (): ColorPickerCtx => useContext(ColorPickerContext)

interface ColorPickerProviderProps {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    children: React.ReactNode
}

/** Provide `cm` / `sceneId` to every `CueColorField` in the subtree. */
export const ColorPickerProvider: React.FC<ColorPickerProviderProps> = ({
    cm,
    sceneId,
    children,
}) => {
    const value = useMemo<ColorPickerCtx>(() => ({ cm, sceneId }), [cm, sceneId])
    return (
        <ColorPickerContext.Provider value={value}>{children}</ColorPickerContext.Provider>
    )
}
