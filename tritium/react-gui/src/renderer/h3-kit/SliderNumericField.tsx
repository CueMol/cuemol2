/**
 * @file h3-kit/SliderNumericField.tsx
 * @description Reusable label + Blueprint Slider + numeric input row
 * with an optional unit suffix.
 *
 * Visual style is shared with the inspector's `NumericEditor`
 * (see `styles/_slider-numeric-field.css`); the inspector retains its
 * own classes (`.insp-slider`, `.insp-numeric-input`) for the version
 * that lives there, and consumers of this widget use the neutral
 * `.h3-slider-*` selectors instead.
 *
 * Used by the Coloring panel's Rainbow deck (Start H / End H /
 * Brightness / Saturation) and the Density-map panel.
 *
 * Commit timing:
 *   - Slider: commit on release (`onRelease`); drag updates the draft
 *     only.
 *   - Numeric input typing: commit on blur or Enter; mid-typing stays
 *     local.
 *   - Stepper buttons: commit immediately on click. The native browser
 *     steppers on `<input type="number">` are hidden via CSS so we can
 *     own the click event ourselves (and apply step-precision rounding
 *     to avoid IEEE-754 drift like `0.2 + 0.1 = 0.30000000000000004`).
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Icon, Slider } from '@blueprintjs/core'

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
 * Round `v` to the precision implied by `step`. For step=0.1 the
 * result is rounded to 1 decimal place, etc. Prevents IEEE-754
 * drift from accumulating across stepper clicks.
 */
function quantize(v: number, step: number): number {
    if (!Number.isFinite(step) || step <= 0) return v
    const decimals = Math.max(0, -Math.floor(Math.log10(step)))
    return Number(v.toFixed(decimals))
}

/** Clamp + quantize for use after every stepper click. */
function clampAndQuantize(v: number, min: number, max: number, step: number): number {
    const clamped = Math.min(max, Math.max(min, v))
    return quantize(clamped, step)
}

/**
 * Slider + numeric input + custom stepper row. Commits via
 * `onCommit(storedValue)`.
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

    // Raw text held while the user is editing the numeric input. When
    // null, the input mirrors `draft` (step-quantized) so it follows the
    // slider / stepper / external value. When non-null, the user is
    // mid-edit and we show their literal keystrokes -- this is what lets
    // an empty field stay empty instead of snapping to 0.
    const [editText, setEditText] = useState<string | null>(null)

    // Format a value to the precision implied by `step`, stripping
    // IEEE-754 noise (e.g. 0.30000000000000004 -> "0.3").
    const formatNum = useCallback(
        (n: number) => String(quantize(n, step)),
        [step],
    )

    const commit = useCallback(
        (next: number) => {
            const stored = next / scale
            if (stored !== value) onCommit(stored)
        },
        [scale, value, onCommit],
    )

    // --- Slider handlers ---
    // Blueprint `Slider`'s `onChange` fires continuously while
    // dragging; `onRelease` fires when the user lets go. Drive the
    // live preview off `onChange`, commit on `onRelease`. Quantize the
    // raw slider value so the input display stays step-aligned.
    const handleSliderChange = useCallback((v: number) => {
        setDraft(quantize(v, step))
        setEditText(null)
    }, [step])
    const handleSliderRelease = useCallback(
        (v: number) => { commit(quantize(v, step)) },
        [commit, step],
    )

    // --- Numeric input handlers (typing path) ---
    // Mid-typing stays local as a raw string; commit on blur / Enter.
    const handleNumericChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setEditText(e.target.value)
        },
        [],
    )
    const handleNumericBlur = useCallback(() => {
        if (editText !== null) {
            const parsed = Number(editText)
            if (editText.trim() !== '' && Number.isFinite(parsed)) {
                const next = clampAndQuantize(parsed, min, max, step)
                setDraft(next)
                commit(next)
            }
            setEditText(null)
        }
    }, [editText, min, max, step, commit])
    const handleNumericKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') e.currentTarget.blur()
        },
        [],
    )

    // --- Stepper handlers ---
    // Custom +/- buttons (native HTML steppers are hidden via CSS).
    // Each click both updates the draft (so the slider follows along)
    // and commits immediately, step-aligned to avoid float drift.
    const stepBy = useCallback(
        (sign: 1 | -1) => {
            const next = clampAndQuantize(draft + sign * step, min, max, step)
            if (next === draft) return
            setDraft(next)
            setEditText(null)
            commit(next)
        },
        [draft, step, min, max, commit],
    )
    const handleStepUp = useCallback(() => { stepBy(1) }, [stepBy])
    const handleStepDown = useCallback(() => { stepBy(-1) }, [stepBy])

    return (
        <div className={`h3-slider-row ${className ?? ''}`}>
            <label className="h3-slider-label">{label}</label>
            <Slider
                min={min}
                max={max}
                stepSize={step}
                value={draft}
                onChange={handleSliderChange}
                onRelease={handleSliderRelease}
                disabled={disabled}
                labelRenderer={false}
                className="h3-slider-slider"
            />
            <input
                type="number"
                className="h3-slider-number"
                min={min}
                max={max}
                step={step}
                value={editText ?? formatNum(draft)}
                disabled={disabled}
                onChange={handleNumericChange}
                onBlur={handleNumericBlur}
                onKeyDown={handleNumericKeyDown}
            />
            <div className="h3-slider-stepper">
                <button
                    type="button"
                    className="h3-slider-stepper-btn"
                    disabled={disabled || draft >= max}
                    onClick={handleStepUp}
                    aria-label="Increment"
                    tabIndex={-1}
                >
                    <Icon icon="chevron-up" size={10} />
                </button>
                <button
                    type="button"
                    className="h3-slider-stepper-btn"
                    disabled={disabled || draft <= min}
                    onClick={handleStepDown}
                    aria-label="Decrement"
                    tabIndex={-1}
                >
                    <Icon icon="chevron-down" size={10} />
                </button>
            </div>
            {unit && <span className="h3-slider-unit">{unit}</span>}
        </div>
    )
}
