/**
 * @file widgets/SliderNumericField.tsx
 * @description Reusable label + Blueprint Slider + NumericInput row,
 * with an optional unit suffix.
 *
 * Visual style is shared with the inspector's `NumericEditor`
 * (see `styles/_slider-numeric-field.css`); the inspector retains its
 * own classes (`.insp-slider`, `.insp-numeric-input`) for the version
 * that lives there, and consumers of this widget use the neutral
 * `.snf-*` selectors instead.
 *
 * Used by the Coloring panel's Rainbow deck (Start H / End H /
 * Brightness / Saturation). Designed to be dropped into any pane that
 * needs the same slider + numeric + unit triple.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Slider } from '@blueprintjs/core'

void React // classic JSX runtime (vitest)

export interface SliderNumericFieldProps {
    /** Label text shown to the left of the slider. */
    label: string
    /** Stored value (post-`scale` division). */
    value: number
    min: number
    max: number
    /** Slider / spinbox step. Defaults to 1. */
    step?: number
    /**
     * Optional unit suffix (e.g. "°", "%"). When omitted the suffix
     * span is not rendered, so other panels that want raw numbers
     * (without a unit column) can still use this widget without an
     * empty gutter on the right.
     */
    unit?: string
    /**
     * Ratio between the displayed value and the stored value
     * (`displayed = stored * scale`). Defaults to 1. Use 100 when the
     * widget should show e.g. 0-100 % but the underlying property is
     * stored as 0-1.
     */
    scale?: number
    onCommit: (next: number) => void
    disabled?: boolean
    /** Extra class applied to the outer row. */
    className?: string
}

/**
 * Slider + NumericInput row with an optional unit. Commits via
 * `onCommit(storedValue)`; the slider commits on release, the numeric
 * input commits on blur / Enter.
 */
export const SliderNumericField: React.FC<SliderNumericFieldProps> = ({
    label,
    value,
    min,
    max,
    step = 1,
    unit,
    scale = 1,
    onCommit,
    disabled,
    className,
}) => {
    const shown = value * scale
    const [draft, setDraft] = useState<number>(shown)
    useEffect(() => setDraft(shown), [shown])

    const commit = useCallback(
        (next: number) => {
            const stored = next / scale
            if (stored !== value) onCommit(stored)
        },
        [scale, value, onCommit],
    )

    // Blueprint Slider's `onChange` fires continuously while dragging;
    // `onRelease` fires when the user lets go. Drive the live preview
    // off `onChange`, commit on `onRelease`.
    const handleSliderChange = useCallback((v: number) => {
        setDraft(v)
    }, [])
    const handleSliderRelease = useCallback(
        (v: number) => {
            commit(v)
        },
        [commit],
    )

    // Plain HTML number input -- keeps the widget chrome light and
    // matches the textbox styling used elsewhere in the Coloring panel.
    // Commits on blur / Enter.
    const handleNumericBlur = useCallback(() => {
        commit(draft)
    }, [commit, draft])

    return (
        <div className={`snf-row ${className ?? ''}`}>
            <label className="snf-label">{label}</label>
            <Slider
                min={min}
                max={max}
                stepSize={step}
                value={draft}
                onChange={handleSliderChange}
                onRelease={handleSliderRelease}
                disabled={disabled}
                labelRenderer={false}
                className="snf-slider"
            />
            <input
                type="number"
                className="snf-number"
                min={min}
                max={max}
                step={step}
                value={draft}
                disabled={disabled}
                onChange={(e) => setDraft(Number(e.target.value))}
                onBlur={handleNumericBlur}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                }}
            />
            {unit && <span className="snf-unit">{unit}</span>}
        </div>
    )
}
