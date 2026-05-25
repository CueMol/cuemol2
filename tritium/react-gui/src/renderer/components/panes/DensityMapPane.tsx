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
    Icon,
    Menu,
    MenuItem,
    Popover,
} from '@blueprintjs/core'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import { useDensityMapPanel } from '../../hooks/useDensityMapPanel'
import { SliderNumericField } from '../widgets/SliderNumericField'
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

interface DensityMapPaneProps {
    cm: AsyncCueMol | null
    activeSceneId: number | undefined
    activeMolViewId: number | undefined
    collapsed?: boolean
    onToggleCollapse?: () => void
}

// Named-colour preview palette mirroring the (much larger) table in
// ColorPane. Keep narrow on purpose -- map renderers ship with
// "#0000FF" defaults so hex paths cover the common case.
const NAMED_COLORS: Record<string, string> = {
    white: '#FFFFFF',
    black: '#000000',
    red: '#E06C75',
    green: '#87C38A',
    blue: '#3B82F6',
    yellow: '#FFE000',
    cyan: '#56B6C2',
    magenta: '#C678DD',
    orange: '#D19A66',
    gray: '#808080',
}

function resolveColorPreview(color: string): string {
    const t = color.trim()
    if (!t) return 'transparent'
    if (NAMED_COLORS[t]) return NAMED_COLORS[t]
    if (t.startsWith('#') || t.startsWith('rgb') || t.startsWith('hsl')) return t
    return t
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
        (propName: MapRendererPropName, value: number | boolean | string) => {
            if (!cm || activeSceneId === undefined || selectedRendId === undefined) return
            cm.invokeService('setMapRendererProp', {
                sceneId: activeSceneId,
                rendId: selectedRendId,
                propName,
                value,
            }).catch((err: unknown) => {
                console.warn('setMapRendererProp failed:', err)
            })
        },
        [cm, activeSceneId, selectedRendId],
    )

    const onRedraw = useCallback(() => {
        if (!cm
            || activeSceneId === undefined
            || activeMolViewId === undefined
            || selectedRendId === undefined) return
        cm.invokeService('redrawMapCenter', {
            sceneId: activeSceneId,
            rendId: selectedRendId,
            viewId: activeMolViewId,
        }).catch((err: unknown) => {
            console.warn('redrawMapCenter failed:', err)
        })
    }, [cm, activeSceneId, activeMolViewId, selectedRendId])

    const onShowCell = useCallback(() => {
        if (!cm || activeSceneId === undefined || !selectedEntry) return
        cm.invokeService('showUnitCellRenderer', {
            sceneId: activeSceneId,
            objId: selectedEntry.objId,
        }).catch((err: unknown) => {
            console.warn('showUnitCellRenderer failed:', err)
        })
    }, [cm, activeSceneId, selectedEntry])

    // --- Color input draft (commit on blur, like ColorPane) ---
    const [colorDraft, setColorDraft] = useState<string>('')
    useEffect(() => { setColorDraft(state?.color ?? '') }, [state?.color])
    const commitColor = useCallback(() => {
        if (!state) return
        if (colorDraft === state.color) return
        setProp('color', colorDraft)
    }, [state, colorDraft, setProp])

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
                icon={state?.useAbsLevel === false ? 'tick' : 'blank'}
                text="Use sigma contour level"
                onClick={() => onPickLevelMode(false)}
            />
            <MenuItem
                icon={state?.useAbsLevel === true ? 'tick' : 'blank'}
                text="Use absolute contour level"
                onClick={() => onPickLevelMode(true)}
            />
        </Menu>
    )

    return (
        <div className="sp-pane">
            <div
                className={`sp-section-header ${onToggleCollapse ? 'collapsible' : ''}`}
                onClick={onToggleCollapse}
            >
                <div className="sp-section-header-left">
                    {onToggleCollapse != null && (
                        <Icon
                            icon={collapsed ? 'chevron-right' : 'chevron-down'}
                            size={12}
                            className="section-chevron"
                        />
                    )}
                    <Icon icon="layers" size={14} className="section-icon" />
                    <span className="section-title">Density map</span>
                </div>
            </div>
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
                            className="selection-mol-select"
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
                                rightIcon="caret-down"
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
                        <div
                            className="color-solid-swatch"
                            style={{ backgroundColor: resolveColorPreview(colorDraft) }}
                        />
                        <input
                            className="color-inline-input color-value-input color-solid-input"
                            value={colorDraft}
                            disabled={disabled}
                            onChange={(e) => setColorDraft(e.target.value)}
                            onBlur={commitColor}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                            }}
                            spellCheck={false}
                        />
                    </div>

                    {/* Sliders */}
                    <SliderNumericField
                        label="Transp:"
                        value={state?.alpha ?? 0}
                        min={0}
                        max={1}
                        step={0.1}
                        onCommit={(v) => setProp('alpha', v)}
                        disabled={disabled}
                    />
                    <SliderNumericField
                        label="Level:"
                        value={levelProps.value}
                        min={levelProps.min}
                        max={levelProps.max}
                        step={levelProps.step}
                        unit={levelProps.unit || undefined}
                        scale={levelProps.scale}
                        onCommit={(v) => setProp('siglevel', v)}
                        disabled={disabled}
                    />
                    <SliderNumericField
                        label="Extent:"
                        value={state?.extent ?? 0}
                        min={0}
                        max={state?.maxExtent ?? 100}
                        step={1}
                        unit="Å"
                        onCommit={(v) => setProp('extent', v)}
                        disabled={disabled}
                    />
                </div>
            )}
        </div>
    )
}
