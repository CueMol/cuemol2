/**
 * @file dialogs/ExportPngOptionsDialog.tsx
 * @description Modal that collects PNG export options (output resolution and
 * transparency). Ports the UXP `exportpng-opt-dlg.xul` + `exportpng-opt-dlg.js`
 * dialog:
 *   - Resolution (DPI) select: 72 / 150 / 300 / 600.
 *   - Width + unit (mm / cm / inch / pixel); Height (disabled while aspect is
 *     locked); "Retain aspect ratio" switch.
 *   - "Transparent PNG" switch (RGBA output).
 *   - OK resolves with the chosen pixel width/height and alpha flag.
 *
 * Pixels are the source of truth (`exportPngSize` helpers); the displayed
 * width/height are derived for the active unit + DPI. The caller seeds the
 * initial pixel size from the live view (`getSceneExportInfo`), which also
 * sets the aspect ratio. OK returns the chosen pixel size, alpha, and DPI.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { DialogShell } from './DialogShell';
import { Field, FieldSection, NumericField, SelectField, SwitchField } from '@renderer/h3-kit/form'
import {
    DPI_OPTIONS,
    fromPixels,
    roundForUnit,
    toPixels,
    type PngUnit,
} from './exportPngSize'

export interface ExportPngOptionsResult {
    width: number
    height: number
    alpha: boolean
    /** Output resolution in DPI (PNG pHYs metadata; UXP `resoln`). */
    dpi: number
}

interface Props {
    visible: boolean
    initialWidth: number
    initialHeight: number
    onConfirm: (result: ExportPngOptionsResult) => void
    onCancel: () => void
}

const UNIT_OPTIONS: { value: PngUnit; label: string }[] = [
    { value: 'px', label: 'pixel' },
    { value: 'mm', label: 'mm' },
    { value: 'cm', label: 'cm' },
    { value: 'in', label: 'inch' },
]

export function ExportPngOptionsDialog({
    visible, initialWidth, initialHeight, onConfirm, onCancel,
}: Props): React.JSX.Element {

    // Pixels are the source of truth.
    const [pxW, setPxW] = useState(initialWidth)
    const [pxH, setPxH] = useState(initialHeight)
    const [dpi, setDpi] = useState(150)
    const [unit, setUnit] = useState<PngUnit>('px')
    const [retainAspect, setRetainAspect] = useState(true)
    const [alpha, setAlpha] = useState(false)

    // Aspect derived from the seeded size; used only while the lock is on.
    const aspect = useMemo(
        () => (initialHeight > 0 ? initialWidth / initialHeight : 1),
        [initialWidth, initialHeight],
    )

    useEffect(() => {
        if (!visible) return
        setPxW(initialWidth)
        setPxH(initialHeight)
        setDpi(150)
        setUnit('px')
        setRetainAspect(true)
        setAlpha(false)
    }, [visible, initialWidth, initialHeight])

    const widthDisplay = roundForUnit(fromPixels(pxW, unit, dpi), unit)
    const heightDisplay = roundForUnit(fromPixels(pxH, unit, dpi), unit)

    const handleWidth = useCallback((v: number) => {
        const w = toPixels(v, unit, dpi)
        if (w <= 0) return
        setPxW(w)
        if (retainAspect) setPxH(Math.max(1, Math.round(w / aspect)))
    }, [unit, dpi, retainAspect, aspect])

    const handleHeight = useCallback((v: number) => {
        const h = toPixels(v, unit, dpi)
        if (h <= 0) return
        setPxH(h)
    }, [unit, dpi])

    const handleRetain = useCallback((on: boolean) => {
        setRetainAspect(on)
        // Re-lock height to the current aspect when turning the lock on.
        if (on) setPxH((h) => (pxW > 0 ? Math.max(1, Math.round(pxW / aspect)) : h))
    }, [pxW, aspect])

    const handleOk = useCallback(() => {
        if (pxW <= 0 || pxH <= 0) return
        onConfirm({ width: pxW, height: pxH, alpha, dpi })
    }, [pxW, pxH, alpha, dpi, onConfirm])

    const stepForUnit = unit === 'px' ? 1 : 0.1

    return (
        <DialogShell
            visible={visible}
            title="PNG options"
            width="md"
            onCancel={onCancel}
            onOk={handleOk}
            okDisabled={pxW <= 0 || pxH <= 0}
        >
                <FieldSection title="Image size">
                    <Field label="Resolution (DPI)">
                        <SelectField
                            value={String(dpi)}
                            onChange={(v) => setDpi(Number(v))}
                        >
                            {DPI_OPTIONS.map((d) => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </SelectField>
                    </Field>
                    <Field label="Unit">
                        <SelectField
                            value={unit}
                            onChange={(v) => setUnit(v as PngUnit)}
                        >
                            {UNIT_OPTIONS.map((u) => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                            ))}
                        </SelectField>
                    </Field>
                    <Field label="Width">
                        <NumericField
                            value={widthDisplay}
                            onChange={handleWidth}
                            min={0}
                            max={100000}
                            step={stepForUnit}
                            slider={false}
                        />
                    </Field>
                    <Field label="Height">
                        <NumericField
                            value={heightDisplay}
                            onChange={handleHeight}
                            min={0}
                            max={100000}
                            step={stepForUnit}
                            slider={false}
                            disabled={retainAspect}
                        />
                    </Field>
                    <Field label="Retain aspect ratio" inline>
                        <SwitchField checked={retainAspect} onChange={handleRetain} />
                    </Field>
                </FieldSection>

                <FieldSection title="Output">
                    <Field label={`Pixel size: ${pxW} x ${pxH}`}>
                        <span />
                    </Field>
                    <Field label="Transparent PNG" inline>
                        <SwitchField checked={alpha} onChange={setAlpha} />
                    </Field>
                </FieldSection>
        </DialogShell>
    )
}
