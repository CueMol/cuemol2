/**
 * @file h3-kit/colorpicker/PalettePanel.tsx
 * @description Preset colour palette grid for the colour picker popover.
 *
 * Ports UXP `buildPaletteBox` / `appendPaletteRow` (colpicker.js): a
 * grayscale row plus seven hue rows, each with seven saturation/brightness
 * variations. Cells are computed locally with `colorMath`; clicking a cell
 * commits its `#rrggbb` value.
 */

import React from 'react'
import { hsbToRgb, packToHex } from './colorMath'

interface PalettePanelProps {
    onSelect: (hex: string) => void
}

interface Cell {
    hex: string
    tip: string
}

// UXP grayscale entry (white -> black).
const GRAYSCALE: Cell[] = [
    { hex: '#ffffff', tip: 'White' },
    { hex: packToHex([191, 191, 191]), tip: '75% Gray' },
    { hex: packToHex([128, 128, 128]), tip: '50% Gray' },
    { hex: packToHex([64, 64, 64]), tip: '25% Gray' },
    { hex: '#000000', tip: 'Black' },
]

// UXP hue rows: [hue, label].
const HUES: Array<[number, string]> = [
    [0, 'Red'],
    [30, 'Orange'],
    [60, 'Yellow'],
    [120, 'Green'],
    [180, 'Cyan'],
    [240, 'Blue'],
    [300, 'Purple'],
]

// UXP saturation/brightness variations per hue.
const VARIATIONS: Array<[number, number]> = [
    [25, 100],
    [50, 100],
    [75, 100],
    [100, 100],
    [100, 75],
    [100, 50],
    [100, 25],
]

function hueRow(hue: number, label: string): Cell[] {
    return VARIATIONS.map(([sat, bri]) => {
        let tip = label
        if (sat !== 100) tip += `, sat=${sat}%`
        if (bri !== 100) tip += `, bri=${bri}%`
        return { hex: packToHex(hsbToRgb([hue, sat, bri])), tip }
    })
}

const ROWS: Cell[][] = [GRAYSCALE, ...HUES.map(([h, l]) => hueRow(h, l))]

/**
 * Preset colour tile grid.
 */
export const PalettePanel: React.FC<PalettePanelProps> = ({ onSelect }) => (
    <div className="h3-color-palette">
        {ROWS.map((row, ri) => (
            <div className="h3-color-palette-row" key={ri}>
                {row.map((cell, ci) => (
                    <button
                        type="button"
                        key={ci}
                        className="h3-color-palette-cell"
                        style={{ background: cell.hex }}
                        title={cell.tip}
                        onClick={() => onSelect(cell.hex)}
                    />
                ))}
            </div>
        ))}
    </div>
)
