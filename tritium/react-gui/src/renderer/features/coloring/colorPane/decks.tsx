/**
 * @file features/coloring/colorPane/decks.tsx
 * @description The coloring pane's per-mode decks: the body it swaps in once a
 * renderer's coloring class is known.
 *
 * Every one of them is presentational -- it takes the parameters the worker
 * read back and an `onCommit`, and owns no state. That is what lets the pane
 * pick a deck by class name and pass the same shape to each.
 *
 * `LabeledNumberField` / `EnumField` are the two row shapes the decks share.
 * They are not in the form catalog yet: moving them there is a catalog
 * decision, and this file is a straight extraction.
 */

import React from 'react'
import {
    Field,
    FieldGrid,
    FieldGridRow,
    ColorField,
    SelectField,
    SliderField,
    RejectNumberInput,
} from '@renderer/h3-kit/form'
import type {
    BfacParams,
    CpkColors,
    ElePotMapObjectEntry,
    ElepotParams,
    RainbowParams,
} from '@renderer/worker/server/services/coloring/coloring.service'

void React // classic JSX runtime (vitest)

interface SolidDeckProps {
    /** UXP-style coloring class name; empty string when coloring is null. */
    className: string
    defaultColor: string
    onCommit: (color: string) => void
}

export const SolidDeck: React.FC<SolidDeckProps> = ({ className, defaultColor, onCommit }) => (
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
export const DeferredDeck: React.FC<DeferredDeckProps> = ({ className }) => (
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
export const CpkDeck: React.FC<CpkDeckProps> = ({ colors, onCommit }) => (
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
export const RainbowDeck: React.FC<RainbowDeckProps> = ({ params, onCommit }) => (
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
export const BfacDeck: React.FC<BfacDeckProps> = ({ params, onCommit }) => {
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
export const ElepotDeck: React.FC<ElepotDeckProps> = ({ params, objects, onCommit }) => (
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
