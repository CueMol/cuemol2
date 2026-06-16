/**
 * @file components/panes/DensityMapPane.tsx
 * @description Side-panel surface that ports UXP `panel.densitymap`
 * (`uxp_gui/cuemol2/base/content/densitymap-panel.{xul,js}`).
 *
 * Contents:
 *   - Renderer dropdown listing every map renderer in the active scene
 *     (UXP filter: contour | isosurf | gpu_mapmesh | gpu_mapvol),
 *     labelled `<objName>/<rendName>`.
 *   - Dropdown menu (toolbar button) with "Use sigma contour level" vs
 *     "Use absolute contour level" radio pair -- toggles `use_abslevel`.
 *   - Redraw button (`redrawMapCenter`) and Cell button (reuses
 *     `showUnitCellRenderer` from the symmetry panel).
 *   - Solid color text input + swatch (always rendered -- multi-gradient
 *     mode is out of scope; see ADR follow-up).
 *   - Transparency / Level / Extent sliders, with sigma-to-absolute
 *     unit conversion handled inline (UXP `updateWidget` /
 *     `validateWidget` parity).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Button,
    HTMLSelect,
    Menu,
    MenuItem,
    Popover,
} from '@blueprintjs/core'
import { AppIcon } from '../AppIcon'
import { SectionHeader } from './SectionHeader'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import { useDensityMapPanel } from '../../hooks/useDensityMapPanel'
import { useRealtimeDragProp } from '../../hooks/useRealtimeDragProp'
import { FieldGrid, FieldGridRow, DragNumericField } from '../../h3-kit/form'
import type {
    MapRendererEntry,
    MapRendererPropName,
} from '../../worker/server/services/densityMapPanelOps.service'
import {
    SEM_OBJECT,
    SEM_RENDERER,
    SEM_SCENE,
    SEM_ANY,
} from '../../event'
import { useCueMolEventListener } from '../../hooks/useCueMolEventListener'
import { CueColorField } from '../../h3-kit/colorpicker/CueColorField'
import { ColorPickerProvider } from '../../h3-kit/colorpicker/ColorPickerContext'
import { fireService } from '../../utils/fireService'

/**
 * Empty icon-column spacer for the unchecked radio rows of the level-mode
 * menu, so checked and unchecked labels align (the check icon is 16px).
 */
const CHECK_SPACER = <span style={{ display: 'inline-block', width: 16 }} aria-hidden />

/** Stored-value write options threaded to `setMapRendererProp`. */
interface MapPropWriteOpts {
    mode?: 'preview' | 'commit' | 'abort'
    originalValue?: number
    originalWasDefault?: boolean
}

/**
 * Labeled drag-to-snap numeric row for the density-map panel. Holds a local
 * draft in displayed units (stored * scale) for live feedback and commits the
 * stored value on drag end / Enter so a drag is one undo step (via
 * `useRealtimeDragProp`).
 *
 * With `realtime`, the renderer updates live during the drag: the worker
 * previews each frame without undo and commits a single step on release.
 * `onWrite` mirrors `setMapRendererProp`'s contract (stored value + optional
 * mode / originalValue).
 */
const DragRow: React.FC<{
    label: string
    value: number
    min: number
    max: number
    step: number
    unit?: string
    scale?: number
    disabled?: boolean
    realtime?: boolean
    /** The prop's default flag (flag-based), frozen at drag start for restore. */
    committedIsDefault?: boolean
    onWrite: (stored: number, opts?: MapPropWriteOpts) => void
}> = ({
    label,
    value,
    min,
    max,
    step,
    unit,
    scale = 1,
    disabled,
    realtime,
    committedIsDefault,
    onWrite,
}) => {
    const dragProps = useRealtimeDragProp({
        committed: value * scale,
        committedIsDefault,
        realtime,
        onPreview: (v) => onWrite(v / scale, { mode: 'preview' }),
        onCommit: (original, v, wasDefault) => {
            const stored = v / scale
            if (stored === original / scale) return
            // Realtime: restore the pre-drag value (and default flag) before the
            // single undo step. Non-realtime: plain commit (current behavior).
            if (realtime)
                onWrite(stored, {
                    mode: 'commit',
                    originalValue: original / scale,
                    originalWasDefault: wasDefault,
                })
            else onWrite(stored)
        },
        onAbort: (original, wasDefault) =>
            onWrite(original / scale, { mode: 'abort', originalWasDefault: wasDefault }),
    })
    return (
        <FieldGridRow label={label}>
            <DragNumericField
                {...dragProps}
                min={min}
                max={max}
                step={step}
                unit={unit}
                disabled={disabled}
            />
        </FieldGridRow>
    )
}

interface DensityMapPaneProps {
    cm: AsyncCueMol | null
    activeSceneId: number | undefined
    activeMolViewId: number | undefined
    collapsed?: boolean
    onToggleCollapse?: () => void
}

/**
 * Compute the absolute-mode slider step from the displayed range.
 * Mirrors UXP `updateWidget` (lines 241-248): `10^floor(log10(rng/100))`.
 * Falls back to a sensible minimum when `rng <= 0`.
 */
function absoluteStep(rangeAbs: number): number {
    if (!Number.isFinite(rangeAbs) || rangeAbs <= 0) return 0.01
    const x = Math.floor(Math.log10(rangeAbs / 100))
    return Math.pow(10, x)
}

export const DensityMapPane: React.FC<DensityMapPaneProps> = ({
    cm,
    activeSceneId,
    activeMolViewId,
    collapsed = false,
    onToggleCollapse,
}) => {
    // --- Renderer enumeration ---
    const [items, setItems] = useState<MapRendererEntry[]>([])
    const [selectedRendId, setSelectedRendId] = useState<number | undefined>(undefined)
    const sceneIdRef = useRef(activeSceneId)
    sceneIdRef.current = activeSceneId
    const listToken = useRef(0)

    const fetchList = useCallback(() => {
        const sid = sceneIdRef.current
        if (!cm || sid === undefined) {
            setItems([])
            return
        }
        const token = ++listToken.current
        cm.invokeService('listMapRenderers', { sceneId: sid })
            .then((res) => {
                if (token !== listToken.current) return
                setItems(res?.items ?? [])
            })
            .catch((err: unknown) => {
                if (token !== listToken.current) return
                console.warn('listMapRenderers failed:', err)
                setItems([])
            })
    }, [cm])

    useEffect(() => { fetchList() }, [cm, activeSceneId, fetchList])

    useCueMolEventListener({
        cm,
        enabled: activeSceneId !== undefined,
        category: '',
        srcMask: SEM_OBJECT | SEM_RENDERER,
        evtMask: SEM_ANY,
        scopeId: activeSceneId ?? -1,
        handler: fetchList,
        debounceMs: 30,
    })
    useCueMolEventListener({
        cm,
        enabled: activeSceneId !== undefined,
        category: '',
        srcMask: SEM_SCENE,
        evtMask: SEM_ANY,
        scopeId: activeSceneId ?? -1,
        handler: fetchList,
        debounceMs: 30,
    })

    // Auto-default the selection when the list churns.
    useEffect(() => {
        const valid =
            selectedRendId !== undefined &&
            items.some((it) => it.rendId === selectedRendId)
        if (valid) return
        const next = items.length > 0 ? items[0].rendId : undefined
        if (next !== selectedRendId) setSelectedRendId(next)
        // Only react to items churn; selectedRendId / setter is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items])

    const selectedEntry = useMemo(
        () => items.find((it) => it.rendId === selectedRendId),
        [items, selectedRendId],
    )

    // --- Renderer state (sliders, color, mode) ---
    const { state } = useDensityMapPanel({
        cm,
        sceneId: activeSceneId,
        rendId: selectedRendId,
    })

    // --- Mutations ---
    const setProp = useCallback(
        (
            propName: MapRendererPropName,
            value: number | boolean | string,
            opts?: MapPropWriteOpts,
        ) => {
            if (!cm || activeSceneId === undefined || selectedRendId === undefined) return
            fireService(cm, 'setMapRendererProp', {
                sceneId: activeSceneId,
                rendId: selectedRendId,
                propName,
                value,
                mode: opts?.mode,
                originalValue: opts?.originalValue,
                originalWasDefault: opts?.originalWasDefault,
            })
        },
        [cm, activeSceneId, selectedRendId],
    )

    const onRedraw = useCallback(() => {
        if (!cm
            || activeSceneId === undefined
            || activeMolViewId === undefined
            || selectedRendId === undefined) return
        fireService(cm, 'redrawMapCenter', {
            sceneId: activeSceneId,
            rendId: selectedRendId,
            viewId: activeMolViewId,
        })
    }, [cm, activeSceneId, activeMolViewId, selectedRendId])

    const onShowCell = useCallback(() => {
        if (!cm || activeSceneId === undefined || !selectedEntry) return
        fireService(cm, 'showUnitCellRenderer', {
            sceneId: activeSceneId,
            objId: selectedEntry.objId,
        })
    }, [cm, activeSceneId, selectedEntry])

    // --- Mode menu ---
    const onPickLevelMode = useCallback(
        (useAbs: boolean) => {
            if (!state) return
            if (state.useAbsLevel === useAbs) return
            setProp('use_abslevel', useAbs)
        },
        [state, setProp],
    )

    const disabled = state == null
    const sigma = String.fromCharCode(0x03c3)

    // --- Level slider parameters (sigma vs absolute mode) ---
    const levelProps = useMemo(() => {
        if (!state) {
            return {
                value: 0, min: -10, max: 10, step: 0.1,
                unit: sigma, scale: 1,
            }
        }
        if (state.useAbsLevel) {
            const rng = (state.maxLevel - state.minLevel) * state.denSigma
            return {
                value: state.siglevel,
                min: state.minLevel * state.denSigma,
                max: state.maxLevel * state.denSigma,
                step: absoluteStep(rng),
                unit: '',
                scale: state.denSigma,
            }
        }
        return {
            value: state.siglevel,
            min: state.minLevel,
            max: state.maxLevel,
            step: 0.1,
            unit: sigma,
            scale: 1,
        }
    }, [state, sigma])

    const modeMenu = (
        <Menu>
            <MenuItem
                icon={
                    state?.useAbsLevel === false ? (
                        <AppIcon name="ui.check" aria-hidden />
                    ) : (
                        CHECK_SPACER
                    )
                }
                text="Use sigma contour level"
                onClick={() => onPickLevelMode(false)}
            />
            <MenuItem
                icon={
                    state?.useAbsLevel === true ? (
                        <AppIcon name="ui.check" aria-hidden />
                    ) : (
                        CHECK_SPACER
                    )
                }
                text="Use absolute contour level"
                onClick={() => onPickLevelMode(true)}
            />
        </Menu>
    )

    return (
        <ColorPickerProvider cm={cm} sceneId={activeSceneId}>
        <div className="sp-pane">
            <SectionHeader
                title="Density map"
                icon="ui.layers"
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
            />
            {!collapsed && (
                <div className="sp-pane-fill">
                    {/* Renderer selector + mode menu */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <HTMLSelect
                            value={selectedRendId ?? ''}
                            onChange={(e) => {
                                const v = Number(e.currentTarget.value)
                                setSelectedRendId(Number.isFinite(v) ? v : undefined)
                            }}
                            fill
                            disabled={items.length === 0}
                            className="selection-mol-select h3-form-select"
                        >
                            {items.length === 0 ? (
                                <option value="">(no map renderers)</option>
                            ) : (
                                items.map((it) => (
                                    <option key={it.rendId} value={it.rendId}>
                                        {(it.objName || `Obj ${it.objId}`)
                                            + '/'
                                            + (it.rendName || `Rend ${it.rendId}`)}
                                    </option>
                                ))
                            )}
                        </HTMLSelect>
                        <Popover content={modeMenu} placement="bottom-end" disabled={disabled}>
                            <Button
                                small
                                className="h3-form-dropdown-caret"
                                rightIcon={<span className="h3-form-caret" aria-hidden />}
                                disabled={disabled}
                                aria-label="Level mode"
                            />
                        </Popover>
                    </div>

                    {/* Redraw / Cell / color row */}
                    <div className="color-solid-row">
                        <Button small onClick={onRedraw} disabled={disabled}>
                            Redraw
                        </Button>
                        <Button small onClick={onShowCell} disabled={disabled}>
                            Cell
                        </Button>
                        <CueColorField
                            value={state?.color ?? ''}
                            onCommit={(v) => setProp('color', v)}
                            disabled={disabled}
                        />
                    </div>

                    {/* Numeric rows */}
                    <FieldGrid>
                        <DragRow
                            label="Transp"
                            value={state?.alpha ?? 0}
                            min={0}
                            max={1}
                            step={0.1}
                            realtime
                            committedIsDefault={state?.defaults.alpha}
                            onWrite={(v, opts) => setProp('alpha', v, opts)}
                            disabled={disabled}
                        />
                        <DragRow
                            label="Level"
                            value={levelProps.value}
                            min={levelProps.min}
                            max={levelProps.max}
                            step={levelProps.step}
                            unit={levelProps.unit || undefined}
                            scale={levelProps.scale}
                            committedIsDefault={state?.defaults.siglevel}
                            onWrite={(v, opts) => setProp('siglevel', v, opts)}
                            disabled={disabled}
                        />
                        <DragRow
                            label="Extent"
                            value={state?.extent ?? 0}
                            min={0}
                            max={state?.maxExtent ?? 100}
                            step={1}
                            unit="Å"
                            committedIsDefault={state?.defaults.extent}
                            onWrite={(v, opts) => setProp('extent', v, opts)}
                            disabled={disabled}
                        />
                    </FieldGrid>
                </div>
            )}
        </div>
        </ColorPickerProvider>
    )
}
