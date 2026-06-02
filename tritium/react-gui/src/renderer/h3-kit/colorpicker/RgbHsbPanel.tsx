/**
 * @file h3-kit/colorpicker/RgbHsbPanel.tsx
 * @description RGB / HSB slider panel for the colour picker popover.
 *
 * Ports the UXP slider deck (`colpicker.js` setupRGB / setupHSB +
 * colorSlider): three labelled rows, each a gradient `ColorSlider` plus a
 * `NumericInput` spinner. The panel owns its working colour as RGB (RGB
 * mode) or HSB (HSB mode) -- like UXP's separate `mHSBValue` -- so dragging
 * a hue slider through a grey does not lose the hue to a round-trip. It is
 * seeded once from `initialRgb` when the popover content mounts; edits are
 * computed locally with `colorMath` (no IPC) and reported upward with both
 * the colour string and the resolved RGB (for instant swatch preview).
 */

import React, { useState } from 'react'
import { NumericInput } from '@blueprintjs/core'
import { ColorSlider } from './ColorSlider'
import { hsbToRgb, packToHex, packToHsbString, rgbToHsb, type Hsb, type Rgb } from './colorMath'

export type SliderMode = 'rgb' | 'hsb'

interface RgbHsbPanelProps {
    mode: SliderMode
    /** Colour to seed the panel with (resolved RGB 0-255). */
    initialRgb: Rgb
    /**
     * Reports an edit: the CueMol colour string, its resolved RGB, and
     * whether the gesture has completed (false during a slider drag).
     */
    onChange: (colorStr: string, rgb: Rgb, completed: boolean) => void
}

interface RowSpec {
    label: string
    min: number
    max: number
    value: number
    gradient: string
}

function rgbRows(rgb: Rgb): RowSpec[] {
    const [r, g, b] = rgb
    return [
        {
            label: 'R',
            min: 0,
            max: 255,
            value: r,
            gradient: `linear-gradient(to right, ${packToHex([0, g, b])}, ${packToHex([255, g, b])})`,
        },
        {
            label: 'G',
            min: 0,
            max: 255,
            value: g,
            gradient: `linear-gradient(to right, ${packToHex([r, 0, b])}, ${packToHex([r, 255, b])})`,
        },
        {
            label: 'B',
            min: 0,
            max: 255,
            value: b,
            gradient: `linear-gradient(to right, ${packToHex([r, g, 0])}, ${packToHex([r, g, 255])})`,
        },
    ]
}

function hsbRows(hsb: Hsb): RowSpec[] {
    const [h, s, v] = hsb
    const hueStops = [0, 60, 120, 180, 240, 300, 360]
        .map((deg) => packToHex(hsbToRgb([deg, s, v])))
        .join(', ')
    return [
        {
            label: 'H',
            min: 0,
            max: 360,
            value: h,
            gradient: `linear-gradient(to right, ${hueStops})`,
        },
        {
            label: 'S',
            min: 0,
            max: 100,
            value: s,
            gradient: `linear-gradient(to right, ${packToHex(hsbToRgb([h, 0, v]))}, ${packToHex(hsbToRgb([h, 100, v]))})`,
        },
        {
            label: 'B',
            min: 0,
            max: 100,
            value: v,
            gradient: `linear-gradient(to right, ${packToHex(hsbToRgb([h, s, 0]))}, ${packToHex(hsbToRgb([h, s, 100]))})`,
        },
    ]
}

/**
 * RGB/HSB slider panel: three gradient sliders + numeric spinners.
 */
export const RgbHsbPanel: React.FC<RgbHsbPanelProps> = ({ mode, initialRgb, onChange }) => {
    // Working colour in the mode's native space, seeded once on mount.
    const [rgb, setRgb] = useState<Rgb>(initialRgb)
    const [hsb, setHsb] = useState<Hsb>(() => rgbToHsb(initialRgb))

    const rows = mode === 'rgb' ? rgbRows(rgb) : hsbRows(hsb)

    const edit = (index: number, next: number, completed: boolean) => {
        if (mode === 'rgb') {
            const out: Rgb = [...rgb]
            out[index] = next
            setRgb(out)
            onChange(packToHex(out), out, completed)
        } else {
            const out: Hsb = [...hsb]
            out[index] = next
            setHsb(out)
            const outRgb = hsbToRgb(out)
            onChange(packToHsbString(out), outRgb, completed)
        }
    }

    return (
        <div className="h3-color-slider-panel">
            {rows.map((row, i) => (
                <div className="h3-color-slider-row" key={row.label}>
                    <span className="h3-color-slider-label">{row.label}</span>
                    <ColorSlider
                        min={row.min}
                        max={row.max}
                        value={row.value}
                        gradient={row.gradient}
                        onChange={(v, completed) => edit(i, v, completed)}
                    />
                    <NumericInput
                        small
                        className="h3-color-slider-spinner"
                        min={row.min}
                        max={row.max}
                        value={row.value}
                        clampValueOnBlur
                        onValueChange={(v) => {
                            if (Number.isNaN(v)) return
                            edit(i, Math.max(row.min, Math.min(row.max, v)), true)
                        }}
                    />
                </div>
            ))}
        </div>
    )
}
