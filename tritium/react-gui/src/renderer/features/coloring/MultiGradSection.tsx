/**
 * @file components/multigrad/MultiGradSection.tsx
 * @description Multi-gradient editor section shared by ColorPane's
 * multigrad deck and DensityMapPane's inline embed.
 *
 * Owns the write path wiring around the CueMol-independent
 * `GradientStopBar`: live drag previews (txn-free, coalesced to one
 * in-flight call), the restore-then-txn commit on release, Esc abort,
 * the selected-stop value/color editors, and the Add / Delete /
 * Delete all / Keep ratio / Preset toolbar. One user gesture = one undo
 * step; nothing here is recorded during a drag.
 *
 * Two responsiveness invariants:
 *   - Every mutation is applied OPTIMISTICALLY to a local display
 *     override before the service round-trip, and `commitNodes` refetches
 *     immediately after posting the write. The refetch bumps the
 *     live-fetch token, discarding any stale in-flight fetch, and message
 *     ordering guarantees the refetched state reflects the commit -- so
 *     the UI never flashes back to the pre-edit state.
 *   - The display domain is independent of the stop range: the fit
 *     baseline is the stop range (or the map's central-95% histogram
 *     range when no stops exist), adjustable by pan (< / >) and zoom
 *     (- / +) with Fit returning to the baseline. It is frozen while an
 *     override is live so the bar does not rescale mid-drag.
 *
 * Requires an ancestor `ColorPickerProvider` (for `CueColorField`).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Menu, MenuItem, Popover } from '@blueprintjs/core'
import {
    Field,
    FormButton,
    RejectNumberInput,
    SelectField,
    SwitchField,
} from '@renderer/h3-kit/form'
import { CueColorField } from '@renderer/h3-kit/colorpicker'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { MultiGradWriteNode } from '@renderer/worker/server/services/rendererColoring.service'
import { fireService } from '@renderer/utils/fireService'
import { useMultiGradState } from './useMultiGradState'
import { useGradientViewDomain } from '@renderer/features/coloring/section/useGradientViewDomain'
import {
    PENDING_SAFETY_MS,
    ZOOM_STEP,
    resolveDisplayHex,
    toWriteNodes,
    type MultiGradStop,
} from '@renderer/features/coloring/section/gradientStops'
import { GradientStopBar, type GradientCommitGesture } from '@renderer/h3-kit/gradient'
import {
    type GradientStop,
    MIN_STOP_SPACING,
    keepRatioRescale,
    moveStopFree,
} from '@renderer/h3-kit/gradient'
import { MULTIGRAD_PRESETS, buildPresetNodes } from '@renderer/worker/shared/multiGradPresets'
interface MultiGradSectionProps {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    rendId: number | null
}

/**
 * The shared multi-gradient editor body. See the file header for the
 * undo / preview / domain contract.
 */
export const MultiGradSection: React.FC<MultiGradSectionProps> = ({
    cm,
    sceneId,
    rendId,
}) => {
    const { state, refetch } = useMultiGradState({ cm, sceneId, rendId })

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [keepRatio, setKeepRatio] = useState(false)
    /** Explicit view domain from zoom/pan; null = follow the fit domain. */
    /** Measured stop-bar width (px) for histogram bin sizing. */
    const [stripWidth, setStripWidth] = useState(0)
    /** Local override while a drag preview / pending commit is live. */
    const [previewStops, setPreviewStops] = useState<MultiGradStop[] | null>(null)
    const draggingRef = useRef(false)
    /** Pre-drag snapshot for the commit/abort restore (write shape). */
    const originalNodesRef = useRef<MultiGradWriteNode[] | null>(null)
    /** Pre-drag display snapshot (for the optimistic abort restore). */
    const originalStopsRef = useRef<MultiGradStop[] | null>(null)
    /** Safety timer that drops a stuck optimistic override. */
    const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const canonicalStops = useMemo<MultiGradStop[]>(
        () =>
            (state?.nodes ?? []).map((n) => ({
                value: n.value,
                hex: n.hex,
                color: n.color,
            })),
        [state?.nodes],
    )

    const clearPendingTimer = useCallback(() => {
        if (pendingTimerRef.current !== null) {
            clearTimeout(pendingTimerRef.current)
            pendingTimerRef.current = null
        }
    }, [])

    // A canonical refetch arrived outside a drag: drop the local override.
    // `commitNodes` refetches right after posting each write (bumping the
    // live-fetch token, which discards stale in-flight fetches), so the
    // first canonical to land here is guaranteed to reflect the commit --
    // clearing never flashes the pre-edit state back.
    useEffect(() => {
        if (!draggingRef.current) {
            clearPendingTimer()
            setPreviewStops(null)
        }
    }, [canonicalStops, clearPendingTimer])

    useEffect(() => clearPendingTimer, [clearPendingTimer])

    // Clamp the selection when the stop count shrinks.
    useEffect(() => {
        if (selectedIndex !== null && selectedIndex >= canonicalStops.length) {
            setSelectedIndex(canonicalStops.length > 0
                ? canonicalStops.length - 1
                : null)
        }
    }, [canonicalStops.length, selectedIndex])

    const displayStops = previewStops ?? canonicalStops
    const {
        viewDomain, histogram,
        handleZoom, handlePan, setViewOverride, isViewOverridden, frozenDomainRef,
    } = useGradientViewDomain({
        cm, sceneId, rendId, state, canonicalStops, previewStops, stripWidth,
    })

    // --- write paths ---

    /** Coalesced fire-and-forget preview: at most one in-flight call. */
    const sendPreview = useMemo(() => {
        let busy = false
        let pending: MultiGradWriteNode[] | null = null
        const send = (nodes: MultiGradWriteNode[]): void => {
            if (!cm || sceneId === undefined || rendId === null) return
            if (busy) {
                pending = nodes
                return
            }
            busy = true
            cm.invokeService('setMultiGradNodes', {
                sceneId, rendId, nodes, mode: 'preview',
            })
                .catch(() => undefined)
                .finally(() => {
                    busy = false
                    const p = pending
                    pending = null
                    if (p) send(p)
                })
        }
        return send
    }, [cm, sceneId, rendId])

    /**
     * Post one committed write and keep the UI on `stops` (optimistic
     * override) until the immediate refetch lands with the canonical
     * result. The refetch is posted AFTER the write, so it resolves to
     * the committed state; its token bump discards stale in-flight
     * fetches that could otherwise flash the old state back.
     */
    const commitNodes = useCallback(
        (
            stops: MultiGradStop[],
            label: string,
            originalNodes?: MultiGradWriteNode[],
        ) => {
            if (!cm || sceneId === undefined || rendId === null) return
            clearPendingTimer()
            setPreviewStops(stops)
            pendingTimerRef.current = setTimeout(() => {
                pendingTimerRef.current = null
                setPreviewStops(null)
            }, PENDING_SAFETY_MS)
            fireService(cm, 'setMultiGradNodes', {
                sceneId, rendId, nodes: toWriteNodes(stops), mode: 'commit',
                originalNodes, label,
            })
            refetch()
        },
        [cm, sceneId, rendId, refetch, clearPendingTimer],
    )

    // --- GradientStopBar wiring ---

    const handleDragStart = useCallback(() => {
        draggingRef.current = true
        originalNodesRef.current = toWriteNodes(canonicalStops)
        originalStopsRef.current = canonicalStops
    }, [canonicalStops])

    const handlePreview = useCallback(
        (stops: GradientStop[]) => {
            setPreviewStops(stops as MultiGradStop[])
            sendPreview(toWriteNodes(stops as MultiGradStop[]))
        },
        [sendPreview],
    )

    const handleCommit = useCallback(
        (stops: GradientStop[], gesture: GradientCommitGesture) => {
            const original = originalNodesRef.current ?? undefined
            draggingRef.current = false
            originalNodesRef.current = null
            originalStopsRef.current = null
            // A bar gesture that changed the stop min/max would make the
            // auto-fit view rescale right after the drop (the dragged
            // endpoint would jump back to the lane edge). Pin the frame
            // that was visible during the gesture instead; Fit is one
            // click away.
            setViewOverride((prev) => {
                if (prev !== null) return prev
                const frozen = frozenDomainRef.current
                if (stops.length >= 2) {
                    const min = stops[0].value
                    const max = stops[stops.length - 1].value
                    const eps = (frozen.max - frozen.min) * 1e-9
                    if (
                        Math.abs(min - frozen.min) <= eps &&
                        Math.abs(max - frozen.max) <= eps
                    ) {
                        return null // fit unchanged: keep auto-following
                    }
                }
                return frozen
            })
            const label =
                gesture === 'add' ? 'Add gradient node'
                : gesture === 'delete' ? 'Delete gradient node'
                : 'Change multi gradient color'
            commitNodes(stops as MultiGradStop[], label, original)
        },
        [commitNodes, frozenDomainRef, setViewOverride],
    )

    const handleAbort = useCallback(() => {
        const original = originalNodesRef.current
        const originalStops = originalStopsRef.current
        draggingRef.current = false
        originalNodesRef.current = null
        originalStopsRef.current = null
        if (!cm || sceneId === undefined || rendId === null || !original) {
            setPreviewStops(null)
            return
        }
        // Optimistically show the pre-drag stops while the abort restores
        // them; the refetch confirms and clears the override.
        clearPendingTimer()
        setPreviewStops(originalStops)
        pendingTimerRef.current = setTimeout(() => {
            pendingTimerRef.current = null
            setPreviewStops(null)
        }, PENDING_SAFETY_MS)
        fireService(cm, 'setMultiGradNodes', {
            sceneId, rendId, nodes: [], mode: 'abort',
            originalNodes: original,
        })
        refetch()
    }, [cm, sceneId, rendId, refetch, clearPendingTimer])

    // --- selected stop editors ---

    const selectedStop =
        selectedIndex !== null ? displayStops[selectedIndex] ?? null : null

    const handleValueCommit = useCallback(
        (next: number) => {
            if (selectedIndex === null) return
            const values = canonicalStops.map((s) => s.value)
            if (keepRatio) {
                const rescaled = keepRatioRescale(values, selectedIndex, next)
                if (rescaled === null) return // vetoed: spacing too small
                const stops = canonicalStops.map((s, i) => ({
                    ...s,
                    value: rescaled[i],
                }))
                commitNodes(stops, 'Change gradient node value')
            } else {
                const { values: moved, index } = moveStopFree(
                    values, selectedIndex, next,
                )
                const others = canonicalStops.filter(
                    (_, i) => i !== selectedIndex,
                )
                const sel = canonicalStops[selectedIndex]
                const stops: MultiGradStop[] = []
                let oi = 0
                for (let i = 0; i < moved.length; ++i) {
                    const src = i === index ? sel : others[oi++]
                    stops.push({ ...src, value: moved[i] })
                }
                setSelectedIndex(index)
                commitNodes(stops, 'Change gradient node value')
            }
        },
        [selectedIndex, canonicalStops, keepRatio, commitNodes],
    )

    const handleColorCommit = useCallback(
        (next: string) => {
            if (selectedIndex === null) return
            const stops = canonicalStops.map((s, i) =>
                i === selectedIndex
                    ? {
                        value: s.value,
                        color: next,
                        hex: resolveDisplayHex(next, s.hex),
                    }
                    : s,
            )
            commitNodes(stops, 'Change gradient node color')
        },
        [selectedIndex, canonicalStops, commitNodes],
    )

    // --- toolbar ---

    const handleAdd = useCallback(() => {
        const sel = selectedIndex !== null
            ? canonicalStops[selectedIndex] ?? null
            : null
        let value: number
        let color: string
        let hex: string
        if (sel) {
            // duplicate the selection; the nudge keeps the value unique
            value = sel.value + MIN_STOP_SPACING
            color = sel.color ?? sel.hex
            hex = sel.hex
        } else if (canonicalStops.length >= 2) {
            value =
                (canonicalStops[0].value +
                    canonicalStops[canonicalStops.length - 1].value) / 2
            color = '#FFFFFF'
            hex = '#FFFFFF'
        } else {
            value = state?.mapStats
                ? (state.mapStats.min + state.mapStats.max) / 2
                : 0
            color = '#FFFFFF'
            hex = '#FFFFFF'
        }
        const values = canonicalStops.map((s) => s.value)
        const { values: merged, index } = moveStopFree(
            [...values, Number.NaN], values.length, value,
        )
        const stops: MultiGradStop[] = []
        let oi = 0
        for (let i = 0; i < merged.length; ++i) {
            if (i === index) {
                stops.push({ value: merged[i], color, hex })
            } else {
                stops.push({ ...canonicalStops[oi++], value: merged[i] })
            }
        }
        setSelectedIndex(index)
        commitNodes(stops, 'Add gradient node')
    }, [selectedIndex, canonicalStops, state?.mapStats, commitNodes])

    const handleDelete = useCallback(() => {
        if (selectedIndex === null) return
        const stops = canonicalStops.filter((_, i) => i !== selectedIndex)
        setSelectedIndex(null)
        commitNodes(stops, 'Delete gradient node')
    }, [selectedIndex, canonicalStops, commitNodes])

    const handleDeleteAll = useCallback(() => {
        setSelectedIndex(null)
        commitNodes([], 'Delete all gradient nodes')
    }, [commitNodes])

    const handlePreset = useCallback(
        (presetId: (typeof MULTIGRAD_PRESETS)[number]['id']) => {
            if (!state?.mapStats) return
            const nodes = buildPresetNodes(presetId, state.mapStats)
            if (!nodes) return
            setSelectedIndex(null)
            commitNodes(
                nodes.map((n) => ({
                    value: n.value,
                    color: n.color,
                    hex: resolveDisplayHex(n.color, '#808080'),
                })),
                'Apply gradient preset',
            )
        },
        [state?.mapStats, commitNodes],
    )

    const handleMapChange = useCallback(
        (mapName: string) => {
            if (!cm || sceneId === undefined || rendId === null) return
            fireService(cm, 'setMultiGradColorMap', {
                sceneId, rendId, mapName,
            })
        },
        [cm, sceneId, rendId],
    )

    if (state === null) return null
    if (!state.ok || !state.capable) return null

    const mapObjects = state.mapObjects
    const colorMapName = state.colorMapName
    const mapUnresolved = state.mapStats === null

    return (
        <>
            <Field label="Color map" inline>
                <SelectField
                    value={colorMapName}
                    disabled={mapObjects.length === 0}
                    onChange={handleMapChange}
                >
                    {mapObjects.find((o) => o.name === colorMapName) ===
                        undefined && (
                        <option value={colorMapName}>
                            {colorMapName || '(no map selected)'}
                        </option>
                    )}
                    {mapObjects.map((o) => (
                        <option key={o.objId} value={o.name}>
                            {o.name}
                        </option>
                    ))}
                </SelectField>
            </Field>

            <div className="mg-zoom-row">
                <span className="type-caption mg-zoom-label">View range</span>
                <div className="mg-toolbar-spacer" />
                <FormButton
                    text="<"
                    aria-label="Pan left"
                    title="Shift the view range left"
                    onClick={() => handlePan(-1)}
                />
                <FormButton
                    text="-"
                    aria-label="Zoom out"
                    title="Widen the view range"
                    onClick={() => handleZoom(ZOOM_STEP)}
                />
                <FormButton
                    text="+"
                    aria-label="Zoom in"
                    title="Narrow the view range"
                    onClick={() => handleZoom(1 / ZOOM_STEP)}
                />
                <FormButton
                    text=">"
                    aria-label="Pan right"
                    title="Shift the view range right"
                    onClick={() => handlePan(1)}
                />
                <FormButton
                    text="Fit"
                    aria-label="Fit view range"
                    title="Fit the gradient range (or the map's central 95%)"
                    disabled={!isViewOverridden}
                    onClick={() => setViewOverride(null)}
                />
            </div>

            <GradientStopBar
                stops={displayStops}
                domain={viewDomain}
                selectedIndex={selectedIndex}
                histogram={histogram}
                keepRatio={keepRatio}
                onSelect={setSelectedIndex}
                onDragStart={handleDragStart}
                onPreview={handlePreview}
                onCommit={handleCommit}
                onAbort={handleAbort}
                onDomainChange={setViewOverride}
                onWidthChange={setStripWidth}
            />

            {displayStops.length === 0 && (
                <p className="mg-guide-note type-caption">
                    {mapUnresolved
                        ? 'No color map is resolved. Pick a map above.'
                        : 'No gradient nodes: the object renders black. ' +
                          'Apply a preset to start.'}
                </p>
            )}

            {selectedStop !== null && (
                <div className="mg-stop-edit-row">
                    <span className="type-label">Value</span>
                    <RejectNumberInput
                        className="mg-stop-value-input"
                        value={selectedStop.value}
                        onCommit={handleValueCommit}
                    />
                    <CueColorField
                        value={selectedStop.color ?? selectedStop.hex}
                        modes={['rgb', 'hsb', 'named', 'palette']}
                        onCommit={handleColorCommit}
                    />
                </div>
            )}

            <div className="mg-toolbar-row">
                <FormButton text="Add" onClick={handleAdd} />
                <FormButton
                    text="Delete"
                    onClick={handleDelete}
                    disabled={selectedIndex === null}
                />
                <FormButton
                    text="Delete all"
                    onClick={handleDeleteAll}
                    disabled={displayStops.length === 0}
                />
                <Popover
                    placement="bottom-start"
                    content={
                        <Menu>
                            {MULTIGRAD_PRESETS.map((p) => (
                                <MenuItem
                                    key={p.id}
                                    text={p.label}
                                    disabled={mapUnresolved}
                                    onClick={() => handlePreset(p.id)}
                                />
                            ))}
                        </Menu>
                    }
                >
                    <FormButton
                        text="Preset"
                        rightIcon={
                            <span className="h3-form-caret" aria-hidden />
                        }
                    />
                </Popover>
                <div className="mg-toolbar-spacer" />
                <Field label="Keep ratio" inline>
                    <SwitchField checked={keepRatio} onChange={setKeepRatio} />
                </Field>
            </div>
        </>
    )
}
