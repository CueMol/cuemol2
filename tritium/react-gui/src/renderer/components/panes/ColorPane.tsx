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
    Menu,
    MenuItem,
    Popover,
    HTMLSelect,
    Tooltip,
} from '@blueprintjs/core'
import { SectionHeader } from './SectionHeader'
import { AppIcon } from '../AppIcon'
import { SliderNumericField } from '../../h3-kit/SliderNumericField'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type { RendColoringId } from '../../../shared/ipcTypes'
import type {
    BfacParams,
    ColoringTargetKind,
    CpkColors,
    ElePotMapObjectEntry,
    ElepotParams,
    PaintCapableRendererEntry,
    PaintEntryDto,
    RainbowParams,
} from '../../worker/server/services/rendererColoring.service'
import { CueColorField } from '../../h3-kit/colorpicker/CueColorField'
import { ColorPickerProvider } from '../../h3-kit/colorpicker/ColorPickerContext'
import { usePaintCapableRenderers } from '../../hooks/usePaintCapableRenderers'
import { useRendererColoringState } from '../../hooks/useRendererColoringState'
import { useElePotMapObjects } from '../../hooks/useElePotMapObjects'
import { PaintSelCell } from './PaintSelCell'
import { fireService } from '../../utils/fireService'

// ────────────────────────────────────────────────────────────
// Coloring type dropdown items
//
// The deck colour editors below use the reusable `CueColorField`, which
// reads `cm` / `sceneId` from the `ColorPickerProvider` wrapped around this
// pane's body (so they need no prop threading).
// ────────────────────────────────────────────────────────────

interface ColoringModeItem {
    label: string
    coloringId: RendColoringId | null
    /** Wired in Phase 1/2/3 (Multi-gradient still deferred). */
    enabled: boolean
    /**
     * UXP `setupColoringSelector` hides the Electrostatic-potential item
     * unless the renderer is `molsurf` / `dsurface`. We mirror that with a
     * per-item gate that the parent component evaluates against
     * `state.surfaceType`.
     */
    surfaceOnly?: boolean
}

const COLORING_MODE_ITEMS: ColoringModeItem[] = [
    { label: 'Paint coloring',          coloringId: 'paint-type-paint',    enabled: true  },
    { label: 'Solid coloring',          coloringId: 'paint-type-solid',    enabled: true  },
    { label: 'CPK coloring',            coloringId: 'paint-type-cpk',      enabled: true  },
    { label: 'Bfac/Occ coloring',       coloringId: 'paint-type-bfac',     enabled: true  },
    { label: 'Rainbow coloring',        coloringId: 'paint-type-rainbow',  enabled: true  },
    { label: 'Electrostatic potential', coloringId: 'paint-type-elepot',   enabled: true, surfaceOnly: true },
    { label: 'Multi-gradient coloring', coloringId: null,                  enabled: false },
    { label: 'Reset to default style',  coloringId: 'paint-type-resetdef', enabled: true  },
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
            <HTMLSelect
                disabled
                fill
                value=""
                onChange={() => {}}
                className="color-enum-select h3-form-select"
            >
                <option value="">(no paint-capable renderers)</option>
            </HTMLSelect>
        )
    }

    return (
        <HTMLSelect
            fill
            value={selectedKey ?? ''}
            className="color-enum-select h3-form-select"
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
    /** sceneId required for MolSelList named-def lookup. */
    sceneId: number
    /**
     * Parent mol uid (for renderer-row targets, the renderer's parent
     * object; for object-row targets, the object itself). Forwarded to
     * MolSelList so the picker shows the molecule's "current (<sel>)"
     * preset and any mol-scope named defs.
     */
    molId?: number
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
    sceneId,
    molId,
}) => {
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
                                        <PaintSelCell
                                            sceneID={sceneId}
                                            molID={molId}
                                            value={entry.selStr}
                                            onFocus={() => onSelect(entry.idx)}
                                            onCommit={(v) =>
                                                onUpdate(entry.idx, 'selStr', v)
                                            }
                                        />
                                    </td>
                                    <td className="color-cell-color">
                                        <CueColorField
                                            value={entry.colorValue ?? ''}
                                            onCommit={(v) =>
                                                onUpdate(entry.idx, 'colorValue', v)
                                            }
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
                            icon={<AppIcon name="ui.add" aria-hidden />}
                            className="color-action-btn"
                            onClick={onAdd}
                        />
                    </Tooltip>
                    <Tooltip content="Remove row" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.remove" aria-hidden />}
                            className="color-action-btn"
                            onClick={onRemove}
                            disabled={!isRowSelected}
                        />
                    </Tooltip>
                    <Tooltip content="Move up" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.arrowUp" aria-hidden />}
                            className="color-action-btn"
                            onClick={onMoveUp}
                            disabled={!isRowSelected || selectedIdx === 0}
                        />
                    </Tooltip>
                    <Tooltip content="Move down" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.arrowDown" aria-hidden />}
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

const SolidDeck: React.FC<SolidDeckProps> = ({ className, defaultColor, onCommit }) => (
    <div className="color-solid-deck">
        <div className="color-section-label">
            {className === '' ? 'Solid coloring' : className}
        </div>
        <div className="color-solid-row">
            <label className="color-solid-label">Default color</label>
            <CueColorField value={defaultColor} onCommit={onCommit} />
        </div>
    </div>
)

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

/**
 * Shared colour-cell editor (text input + preview swatch). Commits on
 * blur via `onCommit(value)`. Used by CPK / Bfac decks so the same
 * inline-edit + swatch UX from the Paint table extends to scalar colour
 * properties.
 */
interface ColorFieldProps {
    label: string
    value: string
    onCommit: (next: string) => void
}

const ColorField: React.FC<ColorFieldProps> = ({ label, value, onCommit }) => (
    <div className="color-field-row">
        <label className="color-field-label">{label}</label>
        <CueColorField value={value} onCommit={onCommit} />
    </div>
)

interface CpkDeckProps {
    colors: CpkColors
    onCommit: (propName: string, value: string) => void
}

/** Mirrors UXP `coloring-deck-cpk.xul`: 7 per-element colour pickers. */
const CpkDeck: React.FC<CpkDeckProps> = ({ colors, onCommit }) => (
    <div className="color-deck-scroll">
        <div className="color-section-label">CPK coloring:</div>
        <ColorField label="Carbon"     value={colors.colC} onCommit={(v) => onCommit('col_C', v)} />
        <ColorField label="Nitrogen"   value={colors.colN} onCommit={(v) => onCommit('col_N', v)} />
        <ColorField label="Oxygen"     value={colors.colO} onCommit={(v) => onCommit('col_O', v)} />
        <ColorField label="Sulfur"     value={colors.colS} onCommit={(v) => onCommit('col_S', v)} />
        <ColorField label="Phosphorus" value={colors.colP} onCommit={(v) => onCommit('col_P', v)} />
        <ColorField label="Hydrogen"   value={colors.colH} onCommit={(v) => onCommit('col_H', v)} />
        <ColorField label="Others"     value={colors.colX} onCommit={(v) => onCommit('col_X', v)} />
    </div>
)

/**
 * Numeric input with blur-commit. Accepts an optional unit suffix and
 * a (min, max) clamp; values outside the range are dropped silently
 * (matches UXP `onRainbowChange` / `onBfacChange` validation).
 */
interface NumberFieldProps {
    label: string
    value: number
    min?: number
    max?: number
    unit?: string
    /** Scale factor: stored / shown ratio. 1 by default; 100 for sat / bri. */
    scale?: number
    decimals?: number
    onCommit: (next: number) => void
    disabled?: boolean
}

const NumberField: React.FC<NumberFieldProps> = ({
    label, value, min, max, unit, scale = 1, decimals, onCommit, disabled,
}) => {
    const shown = (value * scale).toString()
    const [draft, setDraft] = useState(shown)
    useEffect(() => setDraft(shown), [shown])
    const commit = () => {
        const parsed = parseFloat(draft)
        if (isNaN(parsed)) {
            setDraft(shown)
            return
        }
        if (min !== undefined && parsed < min) { setDraft(shown); return }
        if (max !== undefined && parsed > max) { setDraft(shown); return }
        const stored = parsed / scale
        const fixed = decimals !== undefined ? Number(stored.toFixed(decimals + 4)) : stored
        if (fixed !== value) onCommit(fixed)
    }
    return (
        <div className="color-field-row">
            <label className="color-field-label">{label}</label>
            <input
                className="color-inline-input color-field-input"
                type="number"
                value={draft}
                disabled={disabled}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                }}
            />
            {unit && <span className="color-field-unit">{unit}</span>}
        </div>
    )
}

/** Shared <HTMLSelect> wrapper with a label column. */
interface EnumFieldProps {
    label: string
    value: string
    options: { value: string; label: string }[]
    onCommit: (next: string) => void
    disabled?: boolean
}

const EnumField: React.FC<EnumFieldProps> = ({
    label, value, options, onCommit, disabled,
}) => (
    <div className="color-field-row">
        <label className="color-field-label">{label}</label>
        <HTMLSelect
            value={value}
            disabled={disabled}
            onChange={(e) => onCommit(e.target.value)}
            className="color-field-input color-enum-select h3-form-select"
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </HTMLSelect>
    </div>
)

interface RainbowDeckProps {
    params: RainbowParams
    onCommit: (propName: string, value: string | number) => void
}

/** Mirrors UXP `coloring-deck-rainbow.xul` -- the four numerics use the
 * `<numslider>` widget (slider + numeric spinbox + unit). */
const RainbowDeck: React.FC<RainbowDeckProps> = ({ params, onCommit }) => (
    <div className="color-deck-scroll">
        <div className="color-section-label">Rainbow coloring:</div>
        <EnumField
            label="Mode" value={params.mode}
            options={[
                { value: 'mol',   label: 'Molecule' },
                { value: 'chain', label: 'Chain'    },
            ]}
            onCommit={(v) => onCommit('mode', v)}
        />
        <EnumField
            label="Change by" value={params.incrMode}
            options={[
                { value: 'chain',  label: 'Chain'        },
                { value: 'resid',  label: 'Residue'      },
                { value: 'protss', label: 'Prot secstr'  },
            ]}
            onCommit={(v) => onCommit('incr_mode', v)}
        />
        <SliderNumericField
            label="Start H" value={params.startHue} min={0} max={360} unit="°"
            onCommit={(v) => onCommit('start_hue', v)}
        />
        <SliderNumericField
            label="End H" value={params.endHue} min={0} max={360} unit="°"
            onCommit={(v) => onCommit('end_hue', v)}
        />
        <SliderNumericField
            label="Brightness" value={params.brightness} min={0} max={100} scale={100} unit="%"
            onCommit={(v) => onCommit('bri', v)}
        />
        <SliderNumericField
            label="Saturation" value={params.saturation} min={0} max={100} scale={100} unit="%"
            onCommit={(v) => onCommit('sat', v)}
        />
    </div>
)

interface BfacDeckProps {
    params: BfacParams
    onCommit: (propName: string, value: string | number) => void
}

/** Mirrors UXP `coloring-deck-bfac.xul`. */
const BfacDeck: React.FC<BfacDeckProps> = ({ params, onCommit }) => {
    const manual = params.autoMode === 'none'
    return (
        <div className="color-deck-scroll">
            <div className="color-section-label">Bfac coloring:</div>
            <EnumField
                label="Mode" value={params.mode}
                options={[
                    { value: 'bfac',   label: 'B-factor'              },
                    { value: 'occ',    label: 'Occupancy'             },
                    { value: 'center', label: 'Distance from center'  },
                ]}
                onCommit={(v) => onCommit('mode', v)}
            />
            <ColorField
                label="Low"  value={params.lowColor}
                onCommit={(v) => onCommit('lowcol', v)}
            />
            <ColorField
                label="High" value={params.highColor}
                onCommit={(v) => onCommit('highcol', v)}
            />
            <div className="color-section-sublabel">Parameter</div>
            <EnumField
                label="Auto" value={params.autoMode}
                options={[
                    { value: 'none', label: 'Manual'        },
                    { value: 'mol',  label: 'Auto (by mol)' },
                    { value: 'rend', label: 'Auto (by rend)' },
                ]}
                onCommit={(v) => onCommit('auto', v)}
            />
            <NumberField
                label="Low" value={params.lowParam} disabled={!manual}
                onCommit={(v) => onCommit('lowpar', v)}
            />
            <NumberField
                label="High" value={params.highParam} disabled={!manual}
                onCommit={(v) => onCommit('highpar', v)}
            />
        </div>
    )
}

interface ElepotDeckProps {
    params: ElepotParams
    /** ElePotMap objects available for the "potential object" selector. */
    objects: ElePotMapObjectEntry[]
    onCommit: (propName: string, value: string | number | boolean) => void
}

/**
 * Mirrors UXP `coloring-deck-elepot.xul`. Properties live on the surface
 * renderer itself (not on a ColoringScheme); the deck appears whenever the
 * renderer's `colormode === "potential"`. The selector is the only widget
 * unique to this deck -- everything else reuses ColorField / NumberField.
 */
const ElepotDeck: React.FC<ElepotDeckProps> = ({ params, objects, onCommit }) => (
    <div className="color-deck-scroll">
        <div className="color-section-label">Elepot coloring:</div>
        <div className="color-field-row">
            <label className="color-field-label">Potential</label>
            <HTMLSelect
                value={params.elepot}
                disabled={objects.length === 0}
                onChange={(e) => onCommit('elepot', e.target.value)}
                className="color-field-input color-enum-select h3-form-select"
            >
                {/* When the renderer's elepot is unset or points to a now-deleted
                  * object, show a sentinel row so the dropdown is still
                  * controlled. UXP shows the same "(none)" state via
                  * `mPotSel.selectObjectByName("")`. */}
                {objects.find((o) => o.name === params.elepot) === undefined && (
                    <option value={params.elepot}>
                        {params.elepot || '(no ElePotMap selected)'}
                    </option>
                )}
                {objects.map((o) => (
                    <option key={o.objId} value={o.name}>
                        {o.name}
                    </option>
                ))}
            </HTMLSelect>
        </div>
        <div className="color-field-row">
            <label className="color-field-label">By SAS</label>
            <input
                type="checkbox"
                checked={params.rampAbove}
                onChange={(e) => onCommit('ramp_above', e.target.checked)}
            />
        </div>
        <div className="color-field-row color-elepot-ramp-row">
            <label className="color-elepot-ramp-label">High</label>
            <NumberFieldInline value={params.highParam} onCommit={(v) => onCommit('highpar', v)} />
            <ColorSwatchInline value={params.highColor} onCommit={(v) => onCommit('highcol', v)} />
        </div>
        <div className="color-field-row color-elepot-ramp-row">
            <label className="color-elepot-ramp-label">Mid</label>
            <NumberFieldInline value={params.midParam} onCommit={(v) => onCommit('midpar', v)} />
            <ColorSwatchInline value={params.midColor} onCommit={(v) => onCommit('midcol', v)} />
        </div>
        <div className="color-field-row color-elepot-ramp-row">
            <label className="color-elepot-ramp-label">Low</label>
            <NumberFieldInline value={params.lowParam} onCommit={(v) => onCommit('lowpar', v)} />
            <ColorSwatchInline value={params.lowColor} onCommit={(v) => onCommit('lowcol', v)} />
        </div>
    </div>
)

/**
 * Compact numeric editor used inside the Elepot ramp rows. Same blur-commit
 * semantics as NumberField but rendered without its label column so the
 * (value, colour) pair fits on one row.
 */
const NumberFieldInline: React.FC<{
    value: number
    onCommit: (next: number) => void
}> = ({ value, onCommit }) => {
    const [draft, setDraft] = useState(value.toString())
    useEffect(() => setDraft(value.toString()), [value])
    const commit = () => {
        const parsed = parseFloat(draft)
        if (isNaN(parsed)) { setDraft(value.toString()); return }
        if (parsed !== value) onCommit(parsed)
    }
    return (
        <input
            className="color-inline-input color-field-input color-elepot-number"
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
    )
}

/**
 * Colour swatch + text editor without the label column. Pair with
 * `NumberFieldInline` to recreate the UXP `(param, colour)` row.
 */
const ColorSwatchInline: React.FC<{
    value: string
    onCommit: (next: string) => void
}> = ({ value, onCommit }) => (
    <CueColorField value={value} onCommit={onCommit} />
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

    // Parent mol uid for the currently-selected target. Forwarded to
    // PaintSelCell so MolSelList can populate its "current (<sel>)" preset
    // and surface molecule-scoped named sel defs.
    const parentMolId = useMemo(() => {
        if (target === null) return undefined
        const entry = renderers.find(
            (r) => r.targetKind === target.targetKind && r.rendId === target.id,
        )
        return entry?.objId
    }, [target, renderers])

    const { state } = useRendererColoringState({
        cm,
        sceneId,
        rendId: target?.id ?? null,
        targetKind: target?.targetKind,
    })

    const className = state?.className ?? ''
    const defaultColor = state?.defaultColor ?? ''
    const entries = state?.paintEntries ?? []
    const surfaceType = state?.surfaceType ?? ''
    const isSurface = surfaceType === 'molsurf' || surfaceType === 'dsurface' || surfaceType === 'dsurf2'
    const isElepotActive = isSurface && state?.colormode === 'potential'

    // Fetch the ElePotMap object list only while the Elepot deck is active;
    // outside of that the dropdown is hidden and the listener would burn
    // cycles on unrelated object-add/remove events.
    const { objects: elePotObjects } = useElePotMapObjects({
        cm,
        sceneId,
        enabled: isElepotActive,
    })

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
            fireService(cm, 'setRendererColoring', {
                ...t,
                coloringId,
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
        fireService(cm, 'addPaintEntry', {
            ...t,
            idx,
            selStr,
            colorValue,
        })
        // The new entry occupies the insert position; track it so the
        // toolbar buttons act on the freshly-added row.
        setSelectedRow(idx)
    }, [cm, requireTarget, selectedRow, entries])

    const onRemoveRow = useCallback(() => {
        const t = requireTarget()
        if (!t || !cm || selectedRow === null) return
        fireService(cm, 'removePaintEntry', { ...t, idx: selectedRow })
        setSelectedRow(null)
    }, [cm, requireTarget, selectedRow])

    const onMoveRow = useCallback(
        (dir: 'up' | 'down') => {
            const t = requireTarget()
            if (!t || !cm || selectedRow === null) return
            const toIdx = dir === 'up' ? selectedRow - 1 : selectedRow + 1
            if (toIdx < 0 || toIdx >= entries.length) return
            fireService(cm, 'movePaintEntry', {
                ...t,
                fromIdx: selectedRow,
                toIdx,
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
            fireService(cm, 'updatePaintEntry', {
                ...t,
                idx,
                selStr: field === 'selStr' ? value : cur.selStr,
                colorValue: field === 'colorValue' ? value : cur.colorValue,
            })
        },
        [cm, requireTarget, entries],
    )

    const onDefaultColorCommit = useCallback(
        (color: string) => {
            const t = requireTarget()
            if (!t || !cm) return
            fireService(cm, 'setRendererDefaultColor', {
                ...t,
                colorValue: color,
            })
        },
        [cm, requireTarget],
    )

    /**
     * Generic ColoringScheme property commit (CPK col_X, Rainbow start_hue,
     * Bfac mode, etc.). Routes through `setColoringProp` which mirrors
     * UXP `commitPropChange` (materialize on default + setProp under undo).
     */
    const onSetColoringProp = useCallback(
        (propName: string, value: string | number) => {
            const t = requireTarget()
            if (!t || !cm) return
            fireService(cm, 'setColoringProp', {
                ...t,
                propName,
                propValue: value,
            })
        },
        [cm, requireTarget],
    )

    /**
     * Elepot widgets commit directly on the renderer (lowpar/midpar/highpar
     * etc.) -- not on a ColoringScheme -- so they route through a separate
     * service. Mirrors UXP `commitElepotPropChange`.
     */
    const onSetElepotProp = useCallback(
        (propName: string, value: string | number | boolean) => {
            const t = requireTarget()
            if (!t || !cm) return
            fireService(cm, 'setRendererElepotProp', {
                ...t,
                propName,
                propValue: value,
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
        // UXP `_setupData` routes surface + colormode==potential to the
        // Elepot deck before evaluating the coloring class, so do the same
        // here -- a surface may have a stale CPK/Rainbow coloring set when
        // it is in potential mode and that should not surface its deck.
        if (isElepotActive && state.elepotParams) {
            return (
                <ElepotDeck
                    params={state.elepotParams}
                    objects={elePotObjects}
                    onCommit={onSetElepotProp}
                />
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
                    sceneId={sceneId}
                    molId={parentMolId}
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
        if (className === 'CPKColoring' && state.cpkColors) {
            return <CpkDeck colors={state.cpkColors} onCommit={onSetColoringProp} />
        }
        if (className === 'RainbowColoring' && state.rainbowParams) {
            return <RainbowDeck params={state.rainbowParams} onCommit={onSetColoringProp} />
        }
        if (className === 'BfacColoring' && state.bfacParams) {
            return <BfacDeck params={state.bfacParams} onCommit={onSetColoringProp} />
        }
        return <DeferredDeck className={className} />
    }

    const dropdownDisabled = target === null

    return (
        <ColorPickerProvider cm={cm} sceneId={sceneId}>
        <div className="sp-pane">
            <SectionHeader
                title="Color"
                icon="ui.tint"
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
                                    {COLORING_MODE_ITEMS
                                        // UXP `setupColoringSelector` hides
                                        // the Electrostatic-potential item on
                                        // non-surface renderers; do the same
                                        // here so the dropdown matches the
                                        // active target's capabilities.
                                        .filter((it) => !it.surfaceOnly || isSurface)
                                        .map((it, i) => (
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
                                className="h3-form-dropdown-caret"
                                rightIcon={<span className="h3-form-caret" aria-hidden />}
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
        </ColorPickerProvider>
    )
}
