/**
 * @file ColorPane.tsx
 * @description Colour-scheme editor pane for renderers.
 *
 * Mirrors the UXP coloring panel (`coloring-panel.xul`) at the per-deck
 * granularity tracked in `docs/migration/uxp-inventory/panels.md`:
 *
 *   - `panel.coloring.shell`        — renderer selector + coloring-type
 *                                     dropdown chrome (this component)
 *   - `panel.coloring.deck.paint`   — Paint table (inline editor)
 *   - `panel.coloring.deck.solid`   — defaultcolor picker
 *   - `panel.coloring.deck.undef`   — "select a renderer" placeholder
 *   - `panel.coloring.deck.{cpk,rainbow,bfac,elepot,multigrad,script}`
 *                                   — Phase 2+ placeholders
 *
 * State flow:
 *   1. `usePaintCapableRenderers` lists candidate renderers for the active
 *      scene and refetches on object/renderer events.
 *   2. The user picks a renderer; `useRendererColoringState` fetches its
 *      coloring class + paint entries (or defaultcolor) and refetches on
 *      coloring / defaultcolor property changes.
 *   3. Mutations (mode switch, Paint Add/Delete/Move/Update, default-color
 *      change) round-trip through worker services; the event subscription
 *      then refetches and re-renders the deck.
 *
 * This pane is one of the components within the ExplorerView.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Button,
    ButtonGroup,
    Icon,
    Menu,
    MenuItem,
    Popover,
    HTMLSelect,
    Tooltip,
} from '@blueprintjs/core'
import { SectionHeader } from './SectionHeader'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type { RendColoringId } from '../../../shared/ipcTypes'
import type {
    ColoringTargetKind,
    PaintCapableRendererEntry,
    PaintEntryDto,
} from '../../worker/server/services/rendererColoring.service'
import { usePaintCapableRenderers } from '../../hooks/usePaintCapableRenderers'
import { useRendererColoringState } from '../../hooks/useRendererColoringState'

// ────────────────────────────────────────────────────────────
// Named colour --> CSS hex preview (subset; informational only)
// ────────────────────────────────────────────────────────────

const NAMED_COLORS: Record<string, string> = {
    SteelBlue: '#4682B4',
    khaki: '#C3B091',
    yellow: '#FFE000',
    red: '#E06C75',
    green: '#87C38A',
    cyan: '#56B6C2',
    magenta: '#C678DD',
    orange: '#D19A66',
    white: '#FFFFFF',
    gray: '#808080',
    black: '#000000',
    blue: '#3B82F6',
}

/** Resolve a CueMol colour string to something the browser can preview. */
const resolveColorPreview = (color: string): string => {
    const trimmed = color.trim()
    if (!trimmed) return 'transparent'
    if (NAMED_COLORS[trimmed]) return NAMED_COLORS[trimmed]
    if (
        trimmed.startsWith('#') ||
        trimmed.startsWith('rgb') ||
        trimmed.startsWith('hsl')
    )
        return trimmed
    // Unknown format (e.g. "(255,128,0,255)" tuple) -- let the browser try.
    return trimmed
}

// ────────────────────────────────────────────────────────────
// Coloring type dropdown items
// ────────────────────────────────────────────────────────────

interface ColoringModeItem {
    label: string
    coloringId: RendColoringId | null
    /** Phase 1 enables Paint / Solid / Reset; others are placeholders. */
    enabled: boolean
}

const COLORING_MODE_ITEMS: ColoringModeItem[] = [
    { label: 'Paint coloring',        coloringId: 'paint-type-paint',    enabled: true  },
    { label: 'Solid coloring',        coloringId: 'paint-type-solid',    enabled: true  },
    { label: 'CPK coloring',          coloringId: null,                  enabled: false },
    { label: 'Bfac/Occ coloring',     coloringId: null,                  enabled: false },
    { label: 'Rainbow coloring',      coloringId: null,                  enabled: false },
    { label: 'Electrostatic potential', coloringId: null,                enabled: false },
    { label: 'Multi-gradient coloring', coloringId: null,                enabled: false },
    { label: 'Reset to default style', coloringId: 'paint-type-resetdef', enabled: true },
]

// ────────────────────────────────────────────────────────────
// Component props
// ────────────────────────────────────────────────────────────

interface ColorPaneProps {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    collapsed?: boolean
    onToggleCollapse?: () => void
}

// ────────────────────────────────────────────────────────────
// Sub-rendering helpers
// ────────────────────────────────────────────────────────────

/**
 * Encode a target row as a string the `<select>` element can carry. Format:
 * `"<kind>:<uid>"`. `parseTargetKey` is the inverse.
 */
type TargetKey = string
const makeKey = (kind: ColoringTargetKind, id: number): TargetKey =>
    `${kind}:${id}`
function parseTargetKey(
    key: string,
): { targetKind: ColoringTargetKind; id: number } | null {
    const sep = key.indexOf(':')
    if (sep < 0) return null
    const kind = key.slice(0, sep)
    const id = Number(key.slice(sep + 1))
    if (kind !== 'object' && kind !== 'renderer') return null
    if (Number.isNaN(id)) return null
    return { targetKind: kind, id }
}

interface RendererSelectorProps {
    renderers: PaintCapableRendererEntry[]
    selectedKey: TargetKey | null
    onChange: (key: TargetKey | null) => void
}

const RendererSelector: React.FC<RendererSelectorProps> = ({
    renderers,
    selectedKey,
    onChange,
}) => {
    // Group by parent object so the object row sits at the top of its
    // <optgroup>, followed by its child renderers (mirrors UXP layout).
    const groups = useMemo(() => {
        const byObj = new Map<number, { objName: string; entries: PaintCapableRendererEntry[] }>()
        for (const r of renderers) {
            const g = byObj.get(r.objId) ?? { objName: r.objName, entries: [] }
            g.entries.push(r)
            byObj.set(r.objId, g)
        }
        return Array.from(byObj.values())
    }, [renderers])

    if (renderers.length === 0) {
        return (
            <HTMLSelect disabled fill value="" onChange={() => {}}>
                <option value="">(no paint-capable renderers)</option>
            </HTMLSelect>
        )
    }

    return (
        <HTMLSelect
            fill
            value={selectedKey ?? ''}
            onChange={(e) => {
                const v = e.target.value
                onChange(v === '' ? null : v)
            }}
        >
            {groups.map((g, gi) => (
                <optgroup key={gi} label={g.objName || '(unnamed)'}>
                    {g.entries.map((r) => {
                        const key = makeKey(r.targetKind, r.rendId)
                        const label =
                            r.targetKind === 'object'
                                ? `${r.name || r.typeName} (object)`
                                : `${r.name || r.typeName} (${r.typeName})`
                        return (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        )
                    })}
                </optgroup>
            ))}
        </HTMLSelect>
    )
}

interface PaintTableProps {
    entries: PaintEntryDto[]
    selectedIdx: number | null
    onSelect: (idx: number) => void
    onAdd: () => void
    onRemove: () => void
    onMoveUp: () => void
    onMoveDown: () => void
    onUpdate: (idx: number, field: 'selStr' | 'colorValue', value: string) => void
}

const PaintTable: React.FC<PaintTableProps> = ({
    entries,
    selectedIdx,
    onSelect,
    onAdd,
    onRemove,
    onMoveUp,
    onMoveDown,
    onUpdate,
}) => {
    // Local edit buffer keyed by idx, so typing in the input is responsive
    // and only commits to the worker on blur.
    const [draft, setDraft] = useState<Record<number, { selStr?: string; colorValue?: string }>>({})
    // Reset drafts when entries change underneath us (event-driven refresh).
    useEffect(() => {
        setDraft({})
    }, [entries])

    const commit = (idx: number, field: 'selStr' | 'colorValue') => {
        const buf = draft[idx]?.[field]
        if (buf === undefined) return
        const current = entries[idx]
        if (!current) return
        if (buf === current[field]) {
            setDraft((p) => {
                const n = { ...p }
                if (n[idx]) {
                    delete n[idx][field]
                    if (!n[idx].selStr && !n[idx].colorValue) delete n[idx]
                }
                return n
            })
            return
        }
        onUpdate(idx, field, buf)
    }

    const cellValue = (idx: number, field: 'selStr' | 'colorValue'): string => {
        const buf = draft[idx]?.[field]
        if (buf !== undefined) return buf
        return entries[idx]?.[field] ?? ''
    }

    const setCell = (idx: number, field: 'selStr' | 'colorValue', value: string) => {
        setDraft((prev) => ({
            ...prev,
            [idx]: { ...(prev[idx] ?? {}), [field]: value },
        }))
    }

    const isRowSelected = selectedIdx !== null

    return (
        <>
            <div className="color-section-label">Paint coloring:</div>
            <div className="color-table-wrap">
                <table className="color-table">
                    <thead>
                        <tr>
                            <th className="color-th-selection">Selection</th>
                            <th className="color-th-color">Color</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.length === 0 ? (
                            <tr>
                                <td colSpan={2} className="color-empty-row">
                                    (no paint entries — click + to add)
                                </td>
                            </tr>
                        ) : (
                            entries.map((entry) => (
                                <tr
                                    key={entry.idx}
                                    className={`color-row ${selectedIdx === entry.idx ? 'selected' : ''}`}
                                    onClick={() => onSelect(entry.idx)}
                                >
                                    <td className="color-cell-selection">
                                        <input
                                            className="color-inline-input"
                                            value={cellValue(entry.idx, 'selStr')}
                                            onChange={(e) =>
                                                setCell(entry.idx, 'selStr', e.target.value)
                                            }
                                            onFocus={() => onSelect(entry.idx)}
                                            onBlur={() => commit(entry.idx, 'selStr')}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') e.currentTarget.blur()
                                            }}
                                            spellCheck={false}
                                        />
                                    </td>
                                    <td
                                        className="color-cell-color"
                                        style={{
                                            backgroundColor: resolveColorPreview(
                                                cellValue(entry.idx, 'colorValue'),
                                            ),
                                        }}
                                    >
                                        <input
                                            className="color-inline-input color-value-input"
                                            value={cellValue(entry.idx, 'colorValue')}
                                            onChange={(e) =>
                                                setCell(entry.idx, 'colorValue', e.target.value)
                                            }
                                            onFocus={() => onSelect(entry.idx)}
                                            onBlur={() => commit(entry.idx, 'colorValue')}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') e.currentTarget.blur()
                                            }}
                                            spellCheck={false}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="color-actions">
                <ButtonGroup minimal>
                    <Tooltip content="Add row" placement="top" compact>
                        <Button
                            small
                            icon={<Icon icon="plus" size={14} />}
                            className="color-action-btn"
                            onClick={onAdd}
                        />
                    </Tooltip>
                    <Tooltip content="Remove row" placement="top" compact>
                        <Button
                            small
                            icon={<Icon icon="minus" size={14} />}
                            className="color-action-btn"
                            onClick={onRemove}
                            disabled={!isRowSelected}
                        />
                    </Tooltip>
                    <Tooltip content="Move up" placement="top" compact>
                        <Button
                            small
                            icon={<Icon icon="arrow-up" size={14} />}
                            className="color-action-btn"
                            onClick={onMoveUp}
                            disabled={!isRowSelected || selectedIdx === 0}
                        />
                    </Tooltip>
                    <Tooltip content="Move down" placement="top" compact>
                        <Button
                            small
                            icon={<Icon icon="arrow-down" size={14} />}
                            className="color-action-btn"
                            onClick={onMoveDown}
                            disabled={
                                !isRowSelected ||
                                (selectedIdx !== null && selectedIdx >= entries.length - 1)
                            }
                        />
                    </Tooltip>
                </ButtonGroup>
            </div>
        </>
    )
}

interface SolidDeckProps {
    /** UXP-style coloring class name; empty string when coloring is null. */
    className: string
    defaultColor: string
    onCommit: (color: string) => void
}

const SolidDeck: React.FC<SolidDeckProps> = ({ className, defaultColor, onCommit }) => {
    const [draft, setDraft] = useState(defaultColor)
    useEffect(() => setDraft(defaultColor), [defaultColor])

    const commit = useCallback(() => {
        if (draft === defaultColor) return
        onCommit(draft)
    }, [draft, defaultColor, onCommit])

    return (
        <div className="color-solid-deck">
            <div className="color-section-label">
                {className === '' ? 'Solid coloring' : className}
            </div>
            <div className="color-solid-row">
                <label className="color-solid-label">Default color</label>
                <div
                    className="color-solid-swatch"
                    style={{ backgroundColor: resolveColorPreview(draft) }}
                />
                <input
                    className="color-inline-input color-value-input color-solid-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                    spellCheck={false}
                />
            </div>
        </div>
    )
}

interface DeferredDeckProps {
    className: string
}

const DeferredDeck: React.FC<DeferredDeckProps> = ({ className }) => (
    <div className="color-deferred-deck">
        <div className="color-section-label">{className}</div>
        <p className="color-deferred-note">
            Editing this coloring mode is not yet implemented. Switch to
            Paint or Solid via the dropdown, or use Reset to default style.
        </p>
    </div>
)

// ────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────

const PAINT_DECK_CLASS = 'PaintColoring'
const SOLID_DECK_CLASSES = new Set(['', 'SolidColoring'])

export const ColorPane: React.FC<ColorPaneProps> = ({
    cm,
    sceneId,
    collapsed,
    onToggleCollapse,
}) => {
    const { renderers } = usePaintCapableRenderers({ cm, sceneId })

    // Selected row is stored as a key (`<kind>:<uid>`) so a single state
    // captures both the target kind and the C++ uid. Parsed at use sites.
    const [selectedKey, setSelectedKey] = useState<TargetKey | null>(null)
    const [selectedRow, setSelectedRow] = useState<number | null>(null)

    // Auto-select the first row when the list changes, and clear when the
    // active row disappears.
    useEffect(() => {
        if (renderers.length === 0) {
            setSelectedKey(null)
            return
        }
        setSelectedKey((prev) => {
            if (prev && renderers.some(
                (r) => makeKey(r.targetKind, r.rendId) === prev,
            )) {
                return prev
            }
            return makeKey(renderers[0].targetKind, renderers[0].rendId)
        })
    }, [renderers])

    // Reset paint-row selection when the active target changes.
    useEffect(() => {
        setSelectedRow(null)
    }, [selectedKey])

    const target = selectedKey ? parseTargetKey(selectedKey) : null

    const { state } = useRendererColoringState({
        cm,
        sceneId,
        rendId: target?.id ?? null,
        targetKind: target?.targetKind,
    })

    const className = state?.className ?? ''
    const defaultColor = state?.defaultColor ?? ''
    const entries = state?.paintEntries ?? []

    // ── Mutation handlers ──
    const requireTarget = useCallback(
        (): {
            sceneId: number
            rendId: number
            targetKind: ColoringTargetKind
        } | null => {
            if (!cm || sceneId === undefined || target === null) return null
            return {
                sceneId,
                rendId: target.id,
                targetKind: target.targetKind,
            }
        },
        [cm, sceneId, target],
    )

    const onSelectMode = useCallback(
        (coloringId: RendColoringId) => {
            const t = requireTarget()
            if (!t || !cm) return
            cm.invokeService('setRendererColoring', {
                ...t,
                coloringId,
            }).catch((err: unknown) => {
                console.warn('setRendererColoring failed:', err)
            })
        },
        [cm, requireTarget],
    )

    const onAddRow = useCallback(() => {
        const t = requireTarget()
        if (!t || !cm) return
        // UXP `onAddCmd` parity:
        //   - insert before the selected row (id = elem.obj_id);
        //     when no row is selected, id = 0 (insert at top).
        //   - inherit sel / color from the selected row (UXP also checks
        //     the parent mol's `sel` first; deferred to a later phase).
        //   - fall back to "*" / "#FFF" when there is no row to inherit
        //     from (paint-propdlg defaults).
        const idx = selectedRow !== null ? selectedRow : 0
        const ref = selectedRow !== null ? entries[selectedRow] : undefined
        const selStr = ref?.selStr ?? '*'
        const colorValue = ref?.colorValue ?? '#FFFFFF'
        cm.invokeService('addPaintEntry', {
            ...t,
            idx,
            selStr,
            colorValue,
        }).catch((err: unknown) => {
            console.warn('addPaintEntry failed:', err)
        })
        // The new entry occupies the insert position; track it so the
        // toolbar buttons act on the freshly-added row.
        setSelectedRow(idx)
    }, [cm, requireTarget, selectedRow, entries])

    const onRemoveRow = useCallback(() => {
        const t = requireTarget()
        if (!t || !cm || selectedRow === null) return
        cm.invokeService('removePaintEntry', { ...t, idx: selectedRow })
            .catch((err: unknown) => {
                console.warn('removePaintEntry failed:', err)
            })
        setSelectedRow(null)
    }, [cm, requireTarget, selectedRow])

    const onMoveRow = useCallback(
        (dir: 'up' | 'down') => {
            const t = requireTarget()
            if (!t || !cm || selectedRow === null) return
            const toIdx = dir === 'up' ? selectedRow - 1 : selectedRow + 1
            if (toIdx < 0 || toIdx >= entries.length) return
            cm.invokeService('movePaintEntry', {
                ...t,
                fromIdx: selectedRow,
                toIdx,
            }).catch((err: unknown) => {
                console.warn('movePaintEntry failed:', err)
            })
            setSelectedRow(toIdx)
        },
        [cm, requireTarget, selectedRow, entries.length],
    )

    const onUpdateCell = useCallback(
        (idx: number, field: 'selStr' | 'colorValue', value: string) => {
            const t = requireTarget()
            const cur = entries[idx]
            if (!t || !cm || !cur) return
            cm.invokeService('updatePaintEntry', {
                ...t,
                idx,
                selStr: field === 'selStr' ? value : cur.selStr,
                colorValue: field === 'colorValue' ? value : cur.colorValue,
            }).catch((err: unknown) => {
                console.warn('updatePaintEntry failed:', err)
            })
        },
        [cm, requireTarget, entries],
    )

    const onDefaultColorCommit = useCallback(
        (color: string) => {
            const t = requireTarget()
            if (!t || !cm) return
            cm.invokeService('setRendererDefaultColor', {
                ...t,
                colorValue: color,
            }).catch((err: unknown) => {
                console.warn('setRendererDefaultColor failed:', err)
            })
        },
        [cm, requireTarget],
    )

    // ── Deck routing ──
    const renderDeck = (): React.ReactNode => {
        if (sceneId === undefined || target === null) {
            return (
                <div className="color-undef-deck">
                    <p>Select a target to edit coloring.</p>
                </div>
            )
        }
        if (state === null) {
            // Brief flash between renderer change and first fetch resolve.
            return <div className="color-undef-deck"><p>Loading...</p></div>
        }
        if (!state.ok) {
            return (
                <div className="color-undef-deck">
                    <p>Coloring is not available for this renderer.</p>
                </div>
            )
        }
        if (className === PAINT_DECK_CLASS) {
            return (
                <PaintTable
                    entries={entries}
                    selectedIdx={selectedRow}
                    onSelect={setSelectedRow}
                    onAdd={onAddRow}
                    onRemove={onRemoveRow}
                    onMoveUp={() => onMoveRow('up')}
                    onMoveDown={() => onMoveRow('down')}
                    onUpdate={onUpdateCell}
                />
            )
        }
        if (SOLID_DECK_CLASSES.has(className)) {
            return (
                <SolidDeck
                    className={className}
                    defaultColor={defaultColor}
                    onCommit={onDefaultColorCommit}
                />
            )
        }
        return <DeferredDeck className={className} />
    }

    const dropdownDisabled = target === null

    return (
        <div className="sp-pane">
            <SectionHeader
                title="Color"
                icon="tint"
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
            />
            {!collapsed && (
                <div className="sp-pane-fill color-panel-body">
                    {/* Renderer selector + coloring-type dropdown -- panel.coloring.shell */}
                    <div className="color-shell-row">
                        <RendererSelector
                            renderers={renderers}
                            selectedKey={selectedKey}
                            onChange={setSelectedKey}
                        />
                        <Popover
                            disabled={dropdownDisabled}
                            placement="bottom-end"
                            content={
                                <Menu>
                                    {COLORING_MODE_ITEMS.map((it, i) => (
                                        <MenuItem
                                            key={i}
                                            text={
                                                it.enabled
                                                    ? it.label
                                                    : `${it.label} (coming soon)`
                                            }
                                            disabled={!it.enabled}
                                            onClick={() => {
                                                if (it.enabled && it.coloringId) {
                                                    onSelectMode(it.coloringId)
                                                }
                                            }}
                                        />
                                    ))}
                                </Menu>
                            }
                        >
                            <Button
                                small
                                rightIcon="caret-down"
                                text="Coloring"
                                disabled={dropdownDisabled}
                            />
                        </Popover>
                    </div>

                    {/* Deck content -- panel.coloring.deck.* */}
                    {renderDeck()}
                </div>
            )}
        </div>
    )
}
