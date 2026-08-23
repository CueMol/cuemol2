/**
 * @file ColorPane.tsx
 * @description Colour-scheme editor pane for renderers.
 *
 * Mirrors the UXP coloring panel (`coloring-panel.xul`) at the per-deck
 * granularity tracked in `docs/migration/uxp-inventory/panels.md`:
 *
 *   - `panel.coloring.shell`        -- renderer selector + coloring-type
 *                                     dropdown chrome (this component). The
 *                                     "Paint coloring" row is a submenu of the
 *                                     scene's `*Paint` style presets (UXP
 *                                     `onPaintColShowing`), not a leaf item.
 *   - `panel.coloring.deck.paint`   -- Paint table (inline editor)
 *   - `panel.coloring.deck.solid`   -- defaultcolor picker
 *   - `panel.coloring.deck.undef`   -- "select a renderer" placeholder
 *   - `panel.coloring.deck.{cpk,rainbow,bfac,elepot,multigrad,script}`
 *                                   -- Phase 2+ placeholders
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
import {
    Field,
    FieldGrid,
    FieldGridRow,
    ColorField,
    SelectField,
    SliderField,
    RejectNumberInput,
} from '../../h3-kit/form'
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
import type { SceneObjectEntry } from '../../worker/server/services/listSceneObjects.service'
import { CueColorField } from '../../h3-kit/colorpicker/CueColorField'
import { ColorPickerProvider } from '../../h3-kit/colorpicker/ColorPickerContext'
import { MultiGradSection } from '../multigrad/MultiGradSection'
import { usePaintCapableRenderers } from '../../hooks/usePaintCapableRenderers'
import { usePaintColoringStyles } from '../../hooks/usePaintColoringStyles'
import { useRendererColoringState } from '../../hooks/useRendererColoringState'
import { useElePotMapObjects } from '../../hooks/useElePotMapObjects'
import { useMolCoordObjects } from '../../hooks/useMolCoordObjects'
import { PaintSelCell } from './PaintSelCell'
import { fireService } from '../../utils/fireService'

// ------------------------------------------------------------
// Coloring type dropdown items
//
// The deck colour editors below use the reusable `CueColorField`, which
// reads `cm` / `sceneId` from the `ColorPickerProvider` wrapped around this
// pane's body (so they need no prop threading).
// ------------------------------------------------------------

interface ColoringModeItem {
    label: string
    coloringId: RendColoringId | null
    enabled: boolean
    /**
     * UXP `setupColoringSelector` hides the Electrostatic-potential item
     * unless the renderer is `molsurf` / `dsurface`. We mirror that with a
     * per-item gate that the parent component evaluates against
     * `state.surfaceType`.
     */
    surfaceOnly?: boolean
    /** Shown only when the renderer exposes a `multi_grad` gradient. */
    multigradOnly?: boolean
}

/**
 * Marker for the "Paint coloring" row: it is not a leaf item but a submenu
 * whose entries are built at render time (see `paintSubmenuItems`).
 */
const PAINT_SUBMENU_ID = 'paint-type-paint'

const COLORING_MODE_ITEMS: ColoringModeItem[] = [
    { label: 'Paint coloring',          coloringId: 'paint-type-paint',    enabled: true  },
    { label: 'Solid coloring',          coloringId: 'paint-type-solid',    enabled: true  },
    // The three CPK entries differ only in the carbon colour, matching the
    // Default / Darkgray / Lightgray CPK styles the renderer context menu
    // offers. Labels follow those styles' `desc`.
    { label: 'CPK coloring',            coloringId: 'paint-type-cpk',      enabled: true  },
    { label: 'CPK (darkgray carbon)',   coloringId: 'paint-type-cpk-darkgray',  enabled: true },
    { label: 'CPK (lightgray carbon)',  coloringId: 'paint-type-cpk-lightgray', enabled: true },
    { label: 'Bfac/Occ coloring',       coloringId: 'paint-type-bfac',     enabled: true  },
    { label: 'Rainbow coloring',        coloringId: 'paint-type-rainbow',  enabled: true  },
    { label: 'Electrostatic potential', coloringId: 'paint-type-elepot',   enabled: true, surfaceOnly: true },
    { label: 'Multi-gradient coloring', coloringId: 'paint-type-multigrad', enabled: true, multigradOnly: true },
    { label: 'Reset to default style',  coloringId: 'paint-type-resetdef', enabled: true  },
]

// ------------------------------------------------------------
// Component props
// ------------------------------------------------------------

interface ColorPaneProps {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    collapsed?: boolean
    onToggleCollapse?: () => void
}

// ------------------------------------------------------------
// Sub-rendering helpers
// ------------------------------------------------------------

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
    /** Clear the whole list (UXP `paintpanel-delallbtn`). */
    onRemoveAll: () => void
    onCut: () => void
    onCopy: () => void
    onPaste: () => void
    /** True while the worker-local paint clipboard holds at least one row. */
    canPaste: boolean
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
    onRemoveAll,
    onCut,
    onCopy,
    onPaste,
    canPaste,
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
                            aria-label="Add row"
                            className="color-action-btn"
                            onClick={onAdd}
                        />
                    </Tooltip>
                    <Tooltip content="Remove row" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.remove" aria-hidden />}
                            aria-label="Remove row"
                            className="color-action-btn"
                            onClick={onRemove}
                            disabled={!isRowSelected}
                        />
                    </Tooltip>
                    <Tooltip content="Move up" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.arrowUp" aria-hidden />}
                            aria-label="Move row up"
                            className="color-action-btn"
                            onClick={onMoveUp}
                            disabled={!isRowSelected || selectedIdx === 0}
                        />
                    </Tooltip>
                    <Tooltip content="Move down" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.arrowDown" aria-hidden />}
                            aria-label="Move row down"
                            className="color-action-btn"
                            onClick={onMoveDown}
                            disabled={
                                !isRowSelected ||
                                (selectedIdx !== null && selectedIdx >= entries.length - 1)
                            }
                        />
                    </Tooltip>
                    <Tooltip content="Remove all rows" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.trash" aria-hidden />}
                            aria-label="Remove all rows"
                            className="color-action-btn"
                            onClick={onRemoveAll}
                            disabled={entries.length === 0}
                        />
                    </Tooltip>
                </ButtonGroup>
                <ButtonGroup minimal>
                    <Tooltip content="Cut row" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.cut" aria-hidden />}
                            aria-label="Cut row"
                            className="color-action-btn"
                            onClick={onCut}
                            disabled={!isRowSelected}
                        />
                    </Tooltip>
                    <Tooltip content="Copy row" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.duplicate" aria-hidden />}
                            aria-label="Copy row"
                            className="color-action-btn"
                            onClick={onCopy}
                            disabled={!isRowSelected}
                        />
                    </Tooltip>
                    <Tooltip
                        content={
                            isRowSelected
                                ? 'Paste before the selected row'
                                : 'Paste at the end'
                        }
                        placement="top"
                        compact
                    >
                        <Button
                            small
                            icon={<AppIcon name="ui.paste" aria-hidden />}
                            aria-label="Paste rows"
                            className="color-action-btn"
                            onClick={onPaste}
                            disabled={!canPaste}
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
        <Field label="Default color" inline>
            <ColorField value={defaultColor} onCommit={onCommit} />
        </Field>
    </div>
)

interface DeferredDeckProps {
    className: string
}

/**
 * Fallback deck for any coloring class `renderClassDeck` has no editor
 * for. It is reachable in normal use, not dead code: a scene can carry
 * coloring classes the panel does not edit (`ScriptColoring`, for one),
 * so the deck names the class and points at the modes that are editable
 * rather than rendering an empty panel.
 */
const DeferredDeck: React.FC<DeferredDeckProps> = ({ className }) => (
    <div className="color-deferred-deck">
        <div className="color-section-label">{className}</div>
        <p className="color-deferred-note">
            Editing this coloring mode is not yet implemented. Switch to
            Paint or Solid via the dropdown, or use Reset to default style.
        </p>
    </div>
)

interface CpkDeckProps {
    colors: CpkColors
    onCommit: (propName: string, value: string) => void
}

/** The deck's rows, in UXP `coloring-deck-cpk.xul` order. */
const CPK_ELEMENTS: { label: string; prop: string; key: keyof CpkColors }[] = [
    { label: 'Carbon',     prop: 'col_C', key: 'colC' },
    { label: 'Nitrogen',   prop: 'col_N', key: 'colN' },
    { label: 'Oxygen',     prop: 'col_O', key: 'colO' },
    { label: 'Sulfur',     prop: 'col_S', key: 'colS' },
    { label: 'Phosphorus', prop: 'col_P', key: 'colP' },
    { label: 'Hydrogen',   prop: 'col_H', key: 'colH' },
    { label: 'Others',     prop: 'col_X', key: 'colX' },
]

/**
 * Mirrors UXP `coloring-deck-cpk.xul`: 7 per-element colour pickers.
 *
 * Laid out with `FieldGrid` rather than a stack of inline `Field`s so the
 * labels share one column. With per-row labels each one ellipsised at its own
 * width once the pane narrowed ("Phosp..." vs "Sul..."), which pushed every
 * swatch to a different x -- the element names here are long enough and
 * different enough in length for that to show at ordinary pane widths.
 */
const CpkDeck: React.FC<CpkDeckProps> = ({ colors, onCommit }) => (
    <div className="color-deck-scroll">
        <div className="color-section-label">CPK coloring:</div>
        <FieldGrid>
            {CPK_ELEMENTS.map(({ label, prop, key }) => (
                <FieldGridRow key={prop} label={label}>
                    <ColorField
                        value={colors[key]}
                        onCommit={(v) => onCommit(prop, v)}
                    />
                </FieldGridRow>
            ))}
        </FieldGrid>
    </div>
)

/**
 * Bfac / elepot numeric field with a label column. Wraps the catalog
 * `RejectNumberInput` (reject-and-revert validation -- out-of-range / NaN is
 * dropped silently, matching UXP `onRainbowChange` / `onBfacChange`) in a
 * `Field` so the label and reject input compose like every other form row.
 */
interface LabeledNumberFieldProps {
    label: string
    value: number
    min?: number
    max?: number
    scale?: number
    decimals?: number
    onCommit: (next: number) => void
    disabled?: boolean
}

const LabeledNumberField: React.FC<LabeledNumberFieldProps> = ({
    label, value, min, max, scale, decimals, onCommit, disabled,
}) => (
    <Field label={label} inline>
        <RejectNumberInput
            value={value}
            min={min}
            max={max}
            scale={scale}
            decimals={decimals}
            onCommit={onCommit}
            disabled={disabled}
        />
    </Field>
)

/**
 * Shared select with a label column: a catalog `SelectField` inside a `Field`
 * so Bfac / Rainbow mode dropdowns compose like every other labeled row.
 */
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
    <Field label={label} inline>
        <SelectField value={value} disabled={disabled} onChange={onCommit}>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </SelectField>
    </Field>
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
        <SliderField
            label="Start H" value={params.startHue} min={0} max={360} unit="°"
            onCommit={(v) => onCommit('start_hue', v)}
        />
        <SliderField
            label="End H" value={params.endHue} min={0} max={360} unit="°"
            onCommit={(v) => onCommit('end_hue', v)}
        />
        <SliderField
            label="Brightness" value={params.brightness} min={0} max={100} scale={100} unit="%"
            onCommit={(v) => onCommit('bri', v)}
        />
        <SliderField
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
            <Field label="Low" inline>
                <ColorField value={params.lowColor} onCommit={(v) => onCommit('lowcol', v)} />
            </Field>
            <Field label="High" inline>
                <ColorField value={params.highColor} onCommit={(v) => onCommit('highcol', v)} />
            </Field>
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
            <LabeledNumberField
                label="Low" value={params.lowParam} disabled={!manual}
                onCommit={(v) => onCommit('lowpar', v)}
            />
            <LabeledNumberField
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
 * renderer's `colormode === "potential"`. The ramp rows are a genuine
 * 3-column layout (label, numeric param, colour swatch); everything else
 * reuses the catalog SelectField / ColorField / RejectNumberInput.
 */
const ElepotDeck: React.FC<ElepotDeckProps> = ({ params, objects, onCommit }) => (
    <div className="color-deck-scroll">
        <div className="color-section-label">Elepot coloring:</div>
        <Field label="Potential" inline>
            <SelectField
                value={params.elepot}
                disabled={objects.length === 0}
                onChange={(v) => onCommit('elepot', v)}
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
            </SelectField>
        </Field>
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
            <RejectNumberInput
                className="color-elepot-number"
                value={params.highParam}
                onCommit={(v) => onCommit('highpar', v)}
            />
            <ColorField value={params.highColor} onCommit={(v) => onCommit('highcol', v)} />
        </div>
        <div className="color-field-row color-elepot-ramp-row">
            <label className="color-elepot-ramp-label">Mid</label>
            <RejectNumberInput
                className="color-elepot-number"
                value={params.midParam}
                onCommit={(v) => onCommit('midpar', v)}
            />
            <ColorField value={params.midColor} onCommit={(v) => onCommit('midcol', v)} />
        </div>
        <div className="color-field-row color-elepot-ramp-row">
            <label className="color-elepot-ramp-label">Low</label>
            <RejectNumberInput
                className="color-elepot-number"
                value={params.lowParam}
                onCommit={(v) => onCommit('lowpar', v)}
            />
            <ColorField value={params.lowColor} onCommit={(v) => onCommit('lowcol', v)} />
        </div>
    </div>
)

// ------------------------------------------------------------
// Main component
// ------------------------------------------------------------

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

    // Rows on the worker-local paint clipboard; gates the Paste button.
    // Copy / Cut update it from their result, so the only reason to ask the
    // worker is a fresh mount (the panel can be collapsed and reopened, or
    // the clipboard filled before this pane first rendered).
    const [clipboardCount, setClipboardCount] = useState(0)
    useEffect(() => {
        if (!cm) return
        let cancelled = false
        cm.invokeService('getPaintClipboardInfo', {})
            .then((res) => {
                if (!cancelled) setClipboardCount(res.count)
            })
            .catch((err: unknown) =>
                console.warn('getPaintClipboardInfo failed:', err),
            )
        return () => {
            cancelled = true
        }
    }, [cm])

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
    const multiGradCapable = state?.multiGradCapable === true
    const isMultiGradActive = multiGradCapable && state?.colormode === 'multigrad'
    // UXP `'coloring' in rend`: gates the Paint/CPK/Bfac/Rainbow/Reset items.
    const hasColoring = state?.hasColoring === true
    // Map renderers without a `coloring` property (contour / gpu_*) carry a
    // multi_grad gradient only, so none of the coloring-class decks apply.
    // The isosurf map renderer has `coloring` (MOLFANC) and is NOT in this
    // group -- it routes through the coloring-class decks like molsurf.
    const isMapRenderer = multiGradCapable && !hasColoring
    // MOLFANC (molecule colormode): the renderer colors by its reference
    // molecule (`target` property); show the "Coloring mol" selector.
    const molFancTarget = state?.molFancTarget
    const isMolFancActive =
        molFancTarget !== undefined && state?.colormode === 'molecule'

    // Fetch the ElePotMap object list only while the Elepot deck is active;
    // outside of that the dropdown is hidden and the listener would burn
    // cycles on unrelated object-add/remove events.
    const { objects: elePotObjects } = useElePotMapObjects({
        cm,
        sceneId,
        enabled: isElepotActive,
    })

    // Molecule list for the "Coloring mol" selector; fetched only while a
    // molecule-colormode renderer is selected (same gating as Elepot).
    const { objects: molObjects } = useMolCoordObjects({
        cm,
        sceneId,
        enabled: isMolFancActive,
    })

    // "Paint coloring" submenu entries (UXP `onPaintColShowing`): a renderer
    // gets the scene's `*Paint` style presets (Default / Woody / Red / ...),
    // applied as a style; an object has no `style` property so it only gets
    // the plain "Default" PaintColoring.
    const { styles: paintStyles } = usePaintColoringStyles({ cm, sceneId })
    const paintSubmenuItems = useMemo((): {
        key: string
        label: string
        coloringId: RendColoringId
    }[] => {
        if (target?.targetKind === 'object') {
            return [{ key: 'default', label: 'Default', coloringId: 'paint-type-paint' }]
        }
        return paintStyles.map((s) => ({
            key: s.name,
            label: s.label,
            coloringId: `style-${s.name}` as RendColoringId,
        }))
    }, [target?.targetKind, paintStyles])

    // -- Mutation handlers --
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

    const onRemoveAllRows = useCallback(() => {
        const t = requireTarget()
        if (!t || !cm) return
        fireService(cm, 'clearPaintEntries', t)
        setSelectedRow(null)
    }, [cm, requireTarget])

    /**
     * Copy / Cut the selected row onto the worker-local paint clipboard.
     * The result carries the new clipboard size, which gates Paste.
     */
    const onClipboardTake = useCallback(
        (mode: 'copy' | 'cut') => {
            const t = requireTarget()
            if (!t || !cm || selectedRow === null) return
            const name = mode === 'cut' ? 'cutPaintEntries' : 'copyPaintEntries'
            cm.invokeService(name, { ...t, idxs: [selectedRow] })
                .then((res) => {
                    setClipboardCount(res.count)
                    if (mode === 'cut' && res.ok) setSelectedRow(null)
                })
                .catch((err: unknown) => console.warn(`${name} failed:`, err))
        },
        [cm, requireTarget, selectedRow],
    )

    const onPasteRows = useCallback(() => {
        const t = requireTarget()
        if (!t || !cm) return
        // UXP `_getPaintSelImpl`: insert before the selected row, or append
        // when nothing is selected.
        cm.invokeService('pastePaintEntries', { ...t, idx: selectedRow })
            .then((res) => {
                if (res.ok) setSelectedRow(res.startIdx)
            })
            .catch((err: unknown) => console.warn('pastePaintEntries failed:', err))
    }, [cm, requireTarget, selectedRow])

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

    /**
     * "Coloring mol" selector commit: write the MOLFANC reference-molecule
     * name into the renderer's `target` property.
     */
    const onSetColoringTarget = useCallback(
        (targetName: string) => {
            const t = requireTarget()
            if (!t || !cm) return
            fireService(cm, 'setRendererColoringTarget', {
                ...t,
                targetName,
            })
        },
        [cm, requireTarget],
    )

    // -- Deck routing --
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
        // Multi-gradient deck: routes on colormode (like Elepot) before the
        // coloring class -- a renderer in multigrad mode may carry a stale
        // coloring object that must not surface its deck.
        if (isMultiGradActive) {
            return (
                <div className="color-deck-scroll">
                    <div className="color-section-label">
                        Multi-gradient coloring:
                    </div>
                    <MultiGradSection
                        cm={cm}
                        sceneId={sceneId}
                        rendId={target.id}
                    />
                </div>
            )
        }
        // A map renderer without a `coloring` property (contour / gpu_*) has
        // no editable coloring outside multigrad mode (its solid color lives
        // in the Density map panel), so guide the user to the mode switch
        // instead of showing a wrong deck.
        if (isMapRenderer) {
            return (
                <div className="color-deck-scroll">
                    <p className="mg-guide-note">
                        This map renderer uses its solid color. Switch to
                        Multi-gradient coloring via the Coloring dropdown to
                        edit a gradient here.
                    </p>
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
        // MOLFANC (molecule colormode): the coloring-class decks below color
        // by the nearest atom of the reference molecule; show a selector for
        // it above the deck. Same sentinel-option shape as the Elepot
        // "Potential" selector so a stale / removed target stays visible.
        const molFancSelector = isMolFancActive ? (
            <Field label="Coloring mol" inline>
                <SelectField
                    value={molFancTarget}
                    disabled={molObjects.length === 0}
                    onChange={onSetColoringTarget}
                >
                    {molObjects.find((o) => o.name === molFancTarget) === undefined && (
                        <option value={molFancTarget}>
                            {molFancTarget || '(no molecule selected)'}
                        </option>
                    )}
                    {molObjects.map((o: SceneObjectEntry) => (
                        <option key={o.uid} value={o.name}>
                            {o.name}
                        </option>
                    ))}
                </SelectField>
            </Field>
        ) : null
        const renderClassDeck = (): React.ReactNode => {
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
                        onRemoveAll={onRemoveAllRows}
                        onCut={() => onClipboardTake('cut')}
                        onCopy={() => onClipboardTake('copy')}
                        onPaste={onPasteRows}
                        canPaste={clipboardCount > 0}
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
        return (
            <>
                {molFancSelector}
                {renderClassDeck()}
            </>
        )
    }

    // Also disabled while the first coloring-state fetch is in flight, so
    // the dropdown never opens with capability flags still unknown.
    const dropdownDisabled = target === null || state === null

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
                                        // UXP `setupColoringSelector` gates:
                                        // the Paint/CPK/Bfac/Rainbow/Solid/
                                        // Reset items require a `coloring`
                                        // property ('coloring' in rend), the
                                        // Multi-gradient item a `multi_grad`
                                        // property, and Electrostatic
                                        // potential additionally a surface
                                        // renderer. Map renderers without
                                        // `coloring` (contour / gpu_*) offer
                                        // only Multi-gradient; isosurf has
                                        // `coloring` (MOLFANC) and offers
                                        // the full paint set. "Paint coloring"
                                        // renders as a submenu of style
                                        // presets rather than a leaf item.
                                        .filter((it) =>
                                            it.multigradOnly
                                                ? multiGradCapable
                                                : it.surfaceOnly
                                                  ? hasColoring && isSurface
                                                  : hasColoring)
                                        .map((it, i) =>
                                            it.coloringId === PAINT_SUBMENU_ID ? (
                                                <MenuItem
                                                    key={i}
                                                    text={it.label}
                                                    disabled={paintSubmenuItems.length === 0}
                                                >
                                                    {paintSubmenuItems.map((s) => (
                                                        <MenuItem
                                                            key={s.key}
                                                            text={s.label}
                                                            onClick={() => onSelectMode(s.coloringId)}
                                                        />
                                                    ))}
                                                </MenuItem>
                                            ) : (
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
                                            ),
                                        )}
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
