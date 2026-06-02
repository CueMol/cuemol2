/**
 * @file h3-kit/colorpicker/ColorSlider.tsx
 * @description Single-channel colour slider with a gradient track.
 *
 * Ports the UXP `colorSlider.xml` binding: a horizontal slider whose track
 * shows the colour gradient for one channel (e.g. red 0-255, or the hue
 * rainbow). Live drag emits `completed=false`; releasing the thumb (pointer
 * up / key up / blur) emits `completed=true`, matching UXP's split between
 * the `change` and `dragStateChange` events so the renderer commits an undo
 * step only once per gesture.
 */

import React, { useRef } from 'react'

interface ColorSliderProps {
    min: number
    max: number
    value: number
    /** CSS background applied to the track (linear-gradient string). */
    gradient: string
    /** `completed` is false during a drag, true when the gesture ends. */
    onChange: (value: number, completed: boolean) => void
    disabled?: boolean
}

/**
 * Gradient-backed range slider for one colour component.
 */
export const ColorSlider: React.FC<ColorSliderProps> = ({
    min,
    max,
    value,
    gradient,
    onChange,
    disabled,
}) => {
    // Tracks the latest value so the end-of-gesture (completed) event reports
    // the final position without waiting for a re-render.
    const latest = useRef(value)
    latest.current = value

    const commit = () => onChange(latest.current, true)

    return (
        <div className="h3-color-slider">
            <div className="h3-color-slider-track" style={{ background: gradient }} />
            <input
                type="range"
                className="h3-color-slider-input"
                min={min}
                max={max}
                value={value}
                disabled={disabled}
                onChange={(e) => {
                    const v = Number(e.target.value)
                    latest.current = v
                    onChange(v, false)
                }}
                onPointerUp={commit}
                onKeyUp={commit}
                onBlur={commit}
            />
        </div>
    )
}
