/**
 * @file renderer/components/widgets/colorpicker/ColorPicker.tsx
 * @description Reusable colour-picker widget (UXP `colpicker.js` port).
 *
 * Layout: a swatch + text box + caret. The caret opens a single popover
 * whose top row is a segmented mode switch (RGB / HSB / Named / Palette /
 * Mol); the body below shows the active mode's panel. This replaces UXP's
 * two-step caret-menu-then-floating-panel flow with one popover so mode
 * switching stays in place. "Mol" applies `$molcol` immediately (it has no
 * editable params).
 *
 * The widget is controlled -- the parent owns the canonical colour string
 * via `value` / `onChange`. `onChange(value, completed)` fires with
 * `completed=false` during live slider drags and `true` on commit (popover
 * close, palette/named pick, text-box blur, mol-color pick), letting callers
 * debounce undo steps.
 *
 * Colour resolution (string -> RGB), the named-colour list, and the
 * out-of-gamut check are delegated to the `compileColor` / `getNamedColors`
 * worker services so previews match the C++ StyleManager exactly.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ButtonGroup, InputGroup, Popover, Tooltip } from '@blueprintjs/core'
import { useTheme } from '../../../contexts/ThemeContext'
import type { AsyncCueMol } from '../../../worker/client/AsyncCueMol'
import type { CompileColorResult } from '../../../worker/server/services/colorPicker.service'
import { packToHex, type Rgb } from './colorMath'
import { RgbHsbPanel } from './RgbHsbPanel'
import { NamedListPanel } from './NamedListPanel'
import { PalettePanel } from './PalettePanel'

const MOL_COLOR = '$molcol'

export type Mode = 'rgb' | 'hsb' | 'named' | 'palette' | 'mol'

const MODE_SEGMENTS: Array<{ mode: Mode; label: string }> = [
    { mode: 'rgb', label: 'RGB' },
    { mode: 'hsb', label: 'HSB' },
    { mode: 'named', label: 'Named' },
    { mode: 'palette', label: 'Palette' },
    { mode: 'mol', label: 'Mol' },
]

/**
 * Pick the panel that matches a colour string's representation, so opening
 * the popover lands on the mode that edits the value in place rather than
 * silently converting it to another representation (e.g. a named colour
 * being rewritten as `#hex` just because the popover opened in RGB mode).
 *
 *   `$molcol`            -> mol
 *   `hsb(...)`           -> hsb
 *   `#hex` / `rgb(...)`  -> rgb
 *   bare name (`red`)    -> named
 */
function representationMode(value: string): Mode {
    const t = value.trim().toLowerCase()
    if (t === MOL_COLOR) return 'mol'
    if (t.startsWith('hsb(')) return 'hsb'
    if (t.startsWith('#') || t.startsWith('rgb(')) return 'rgb'
    return 'named'
}

interface ColorPickerProps {
    /** Canonical CueMol colour string (e.g. "#0000FF", "red", "$molcol"). */
    value: string
    sceneId: number | undefined
    cm: AsyncCueMol | null
    /** completed=false during a live drag, true on commit. */
    onChange: (value: string, completed: boolean) => void
    disabled?: boolean
    className?: string
    /**
     * Subset of mode segments to expose, in display order. Defaults to all
     * five. Use e.g. `['rgb', 'hsb', 'palette']` for scene-independent colours
     * where "Named" / "Mol" make no sense (app settings).
     */
    modes?: Mode[]
}

/**
 * Colour-picker widget: swatch + text box + single popover with a segmented
 * mode switch over the RGB / HSB / Named / Palette panels.
 */
export const ColorPicker: React.FC<ColorPickerProps> = ({
    value,
    sceneId,
    cm,
    onChange,
    disabled,
    className,
    modes,
}) => {
    const { theme } = useTheme()
    const portalClassName = theme === 'dark' ? 'bp5-dark' : ''

    // Visible mode segments, honouring the optional `modes` allow-list.
    const segments = useMemo(
        () => (modes ? MODE_SEGMENTS.filter((seg) => modes.includes(seg.mode)) : MODE_SEGMENTS),
        [modes],
    )

    // Mode that matches the current value's representation, clamped to the
    // visible segments (e.g. a named colour in a settings picker without a
    // "Named" segment falls back to the first available mode).
    const modeForValue = useCallback(
        (v: string): Mode => {
            const m = representationMode(v)
            return segments.some((seg) => seg.mode === m) ? m : segments[0]?.mode ?? 'rgb'
        },
        [segments],
    )

    const [draft, setDraft] = useState(value)
    const [resolved, setResolved] = useState<CompileColorResult | null>(null)
    const [liveRgb, setLiveRgb] = useState<Rgb | null>(null)
    const [open, setOpen] = useState(false)
    const [mode, setMode] = useState<Mode>(() => modeForValue(value))

    // Latest live value, so the popover-close commit reports the final colour.
    const liveValueRef = useRef(value)

    // Resolve the authoritative colour whenever the parent value changes.
    useEffect(() => {
        setDraft(value)
        liveValueRef.current = value
        let cancelled = false
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
                if (cancelled) return
                setResolved(res ?? null)
                setLiveRgb(res?.ok && res.r !== undefined ? [res.r, res.g!, res.b!] : null)
            } catch (err: unknown) {
                if (cancelled) return
                console.warn('compileColor failed:', err)
                setResolved(null)
                setLiveRgb(null)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [value, sceneId, cm])

    const isMol = value === MOL_COLOR
    const swatchColor = liveRgb ? packToHex(liveRgb) : 'transparent'

    // --- Live panel edits (sliders) ---
    const handlePanelChange = useCallback(
        (colorStr: string, rgb: Rgb, completed: boolean) => {
            liveValueRef.current = colorStr
            setDraft(colorStr)
            setLiveRgb(rgb)
            onChange(colorStr, completed)
        },
        [onChange],
    )

    // --- Named / palette pick (immediate commit, popover stays open) ---
    const handlePick = useCallback(
        (colorStr: string) => {
            liveValueRef.current = colorStr
            setDraft(colorStr)
            onChange(colorStr, true)
        },
        [onChange],
    )

    // --- Text box commit ---
    const commitText = useCallback(async () => {
        if (draft === value) return
        if (!cm) {
            onChange(draft, true)
            return
        }
        let res: CompileColorResult | null = null
        try {
            res = await cm.invokeService('compileColor', {
                colorStr: draft,
                sceneId: sceneId ?? 0,
            })
        } catch (err: unknown) {
            console.warn('compileColor failed:', err)
        }
        if (res?.ok) {
            onChange(draft, true)
        } else {
            // Invalid input -- revert to the last valid value.
            setDraft(value)
        }
    }, [draft, value, cm, sceneId, onChange])

    // --- Mode segment switch ---
    const selectMode = (next: Mode) => {
        setMode(next)
        if (next === 'mol') {
            // "Mol" has no editable params -- apply $molcol immediately.
            liveValueRef.current = MOL_COLOR
            setDraft(MOL_COLOR)
            onChange(MOL_COLOR, true)
        }
    }

    // Open on the panel that matches the current value's representation, so
    // the popover edits the value in place (and a named colour shows its
    // entry preselected) instead of defaulting to RGB.
    const handleOpen = () => {
        setMode(modeForValue(value))
        setOpen(true)
    }

    // Commit the live colour when the popover closes (UXP onPopupHiding).
    const handleClose = () => {
        setOpen(false)
        if (liveValueRef.current !== value) {
            onChange(liveValueRef.current, true)
        }
    }

    const panelBody = (() => {
        switch (mode) {
            case 'rgb':
            case 'hsb':
                return (
                    <RgbHsbPanel
                        mode={mode}
                        initialRgb={liveRgb ?? [0, 0, 0]}
                        onChange={handlePanelChange}
                    />
                )
            case 'named':
                return (
                    <NamedListPanel
                        cm={cm}
                        sceneId={sceneId}
                        // A bare-name value is a named colour; pass it straight
                        // through (NamedListPanel matches case-insensitively).
                        // Independent of the async `compileColor` class name.
                        selectedName={
                            representationMode(value) === 'named' ? value : undefined
                        }
                        onSelect={handlePick}
                    />
                )
            case 'palette':
                return <PalettePanel onSelect={handlePick} />
            case 'mol':
                return (
                    <div className="cp-mol-note">
                        Uses the parent molecule&apos;s colour (<code>$molcol</code>).
                    </div>
                )
        }
    })()

    const popoverContent = (
        <div className="cp-panel">
            <ButtonGroup className="cp-modebar" fill>
                {segments.map((seg) => (
                    <Button
                        key={seg.mode}
                        small
                        text={seg.label}
                        active={mode === seg.mode}
                        onClick={() => selectMode(seg.mode)}
                    />
                ))}
            </ButtonGroup>
            <div className="cp-panel-body">{panelBody}</div>
        </div>
    )

    return (
        <Popover
            isOpen={open}
            onClose={handleClose}
            placement="bottom-start"
            portalClassName={portalClassName}
            content={popoverContent}
            renderTarget={({ isOpen: _o, ref, ...targetProps }) => (
                <div
                    {...targetProps}
                    ref={ref}
                    className={'cp-widget' + (className ? ' ' + className : '')}
                >
                    {resolved && resolved.inGamut === false ? (
                        <Tooltip content="Out of gamut -- click to clamp" compact>
                            <button
                                type="button"
                                className="cp-swatch cp-swatch--warn"
                                style={{ background: swatchColor }}
                                disabled={disabled}
                                onClick={() => {
                                    if (resolved.devR !== undefined) {
                                        handlePick(
                                            packToHex([
                                                resolved.devR,
                                                resolved.devG!,
                                                resolved.devB!,
                                            ]),
                                        )
                                    }
                                }}
                            />
                        </Tooltip>
                    ) : (
                        <span
                            className={'cp-swatch' + (isMol ? ' cp-swatch--mol' : '')}
                            style={{ background: swatchColor }}
                        />
                    )}
                    <InputGroup
                        small
                        fill
                        className="cp-textbox"
                        value={draft}
                        disabled={disabled}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => void commitText()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                        spellCheck={false}
                    />
                    <Button
                        small
                        minimal
                        rightIcon="caret-down"
                        disabled={disabled}
                        onClick={() => (open ? handleClose() : handleOpen())}
                    />
                </div>
            )}
        />
    )
}
