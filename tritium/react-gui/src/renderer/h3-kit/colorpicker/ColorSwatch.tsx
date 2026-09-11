/**
 * @file h3-kit/colorpicker/ColorSwatch.tsx
 * @description Read-only view of a colour: the resolved swatch plus the string
 * that produced it.
 *
 * The display half of `ColorPicker`, for a surface that shows a colour without
 * being an editor -- a table cell that only becomes editable on an explicit
 * gesture (see ui-style-guide, the listbox row-edit-mode rule). It resolves
 * through the same `useCompiledColor` the picker does, so the two never
 * disagree about what `$molcol` or a named colour looks like.
 */

import React from 'react'
import { useColorPickerCtx } from './ColorPickerContext'
import { useCompiledColor } from './useCompiledColor'
import { packToHex } from './colorMath'

void React // classic JSX runtime (vitest)

const MOL_COLOR = '$molcol'

export interface ColorSwatchProps {
    /** Canonical CueMol colour string. */
    value: string
    /**
     * Open the colour picker. Given, the view grows the same chevron the
     * editable field has, and the swatch becomes a button too (a colour well
     * is expected to be clickable). Without it the view is inert.
     */
    onOpenPicker?: () => void
    className?: string
}

/**
 * Swatch + colour string + the picker chevron.
 *
 * `cm` / `sceneId` come from the ambient `ColorPickerProvider`, as in
 * `CueColorField`, so a caller supplies only the value.
 */
export const ColorSwatch: React.FC<ColorSwatchProps> = ({
    value,
    onOpenPicker,
    className,
}) => {
    const { cm, sceneId } = useColorPickerCtx()
    const { liveRgb } = useCompiledColor(cm, value, sceneId)
    const swatchColor = liveRgb ? packToHex(liveRgb) : 'transparent'
    const isMol = value === MOL_COLOR
    const swatchClass =
        'h3-color-swatch' + (isMol ? ' h3-color-swatch--mol' : '')

    return (
        <span className={'h3-color-view' + (className ? ' ' + className : '')}>
            {onOpenPicker ? (
                <button
                    type="button"
                    className={swatchClass}
                    aria-label="Open color picker"
                    style={{ background: swatchColor }}
                    onClick={onOpenPicker}
                />
            ) : (
                <span
                    className={swatchClass}
                    style={{ background: swatchColor }}
                    aria-hidden
                />
            )}
            <span className="h3-color-view-text type-row">{value}</span>
            {onOpenPicker && (
                // The chevron the editable field carries, kept here so the
                // picker stays one click away in display mode -- it opens a
                // popover, which is a separate thing from editing the text.
                <button
                    type="button"
                    className="h3-color-caret-btn"
                    aria-label="Open color picker"
                    onClick={onOpenPicker}
                >
                    <span className="h3-form-caret" aria-hidden />
                </button>
            )}
        </span>
    )
}
