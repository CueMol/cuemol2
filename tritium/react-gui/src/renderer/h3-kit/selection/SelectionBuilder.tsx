/**
 * @file h3-kit/selection/SelectionBuilder.tsx
 * @description Tabbed UI for picking or composing CueMol selection expressions
 * without typing the grammar. Hosted by the SelectionPane and the MolSelList
 * picker popover.
 *
 * ## Model
 *
 * The "current selection" is the target molecule's `mol.sel` (single source of
 * truth), passed in as `current`. The builder never owns it. Four tabs:
 *
 * - The NAMED / HISTORY tabs list ready-made expressions (named selection defs
 *   and recently used expressions). A click applies the expression right away
 *   as a replacement through `onQuickApply` (fallback: `onApply`) -- the
 *   one-click path for the common "select protein" case, matching the legacy
 *   UXP dropdown. Combining a ready-made expression into the current selection
 *   instead goes through the Term tab's Named / History keywords.
 * - The TERM tab composes a term -- a property keyword (`keyword value`
 *   syntax) or the Named / History keywords (pick a ready-made expression from
 *   the candidate dropdown beside it) -- and combines it into the current
 *   selection via binary set operations (Replace / Add / Subtract /
 *   Intersect). Pressing Enter in a term value field applies the term
 *   directly while `current` is empty (Set is the only meaningful op then).
 * - The MOD tab reshapes the current selection via unary transforms (Invert /
 *   Byres / Sidechain / Mainchain / Around / Expand); it takes no term.
 *
 * Every op button computes the resulting expression and hands it to
 * `onApply`, which the container writes straight to `mol.sel` (live).
 * Logical operators are never typed by the user.
 *
 * The operand draft (`draft` / `dispatch`) is controlled by the container so it
 * can be persisted across side-panel activity-group switches; the active tab
 * is builder-local, so every fresh mount starts on Named (the frequent path).
 * There is no builder-local undo/redo -- stepping back is the scene undo
 * (Cmd+Z).
 *
 * Apply and Mod are each a 2x2 grid of labelled buttons. Every action button
 * shows the would-be hit count as an inline badge (so the user can predict the
 * result before applying) and the full op name in a canonical h3-kit tooltip.
 *
 * Grammar reference: `src/modules/molstr/parser_sel.yxx` / `scanner_sel.lxx`
 * (see selectionExpr.ts / selectionGrammar.ts).
 *
 * @module SelectionBuilder
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Tooltip, AppIcon } from '@renderer/h3-kit/primitives';
import type { AppIconKey } from '@renderer/h3-kit/primitives';
import {
    ComboBoxField,
    FormButton,
    SegmentField,
    SelectField,
    TextField,
    type SegmentFieldOption,
} from '@renderer/h3-kit/form';
import type { ResolveValues } from './useSelectionValues';
import { KEYWORDS, getKeywordDef, type Keyword } from './selectionGrammar';
import type { BinaryOp, UnaryOp } from './selectionExpr';
import { applyBinary, applyUnary, canApplyBinary } from './selectionExpr';
import type { BuilderState, BuilderAction } from './selBuilderReducer';
import { canApplyUnary, selectTerm } from './selBuilderReducer';
import { useSelHitCount, type GetHitCount } from '@renderer/h3-kit/MolSelList/useSelHitCount';
import { CountTag } from '@renderer/h3-kit/MolSelList/CountTag';
import { NamedSelMenu, HistoryMenu } from '@renderer/h3-kit/MolSelList/SelMenus';

/* --- Props --- */

export interface SelectionBuilderProps {
    /** Applied selection (mol.sel reflection) -- the base of every operation. */
    current: string;
    /** Operand-draft state (owned by the container so it persists). */
    draft: BuilderState;
    /** Dispatch operand-draft actions. */
    dispatch: React.Dispatch<BuilderAction>;
    /** Apply a newly-composed expression to the molecule (container writes it). */
    onApply: (expr: string) => void;
    /**
     * Immediate-apply channel: a Named / History tab click (or Enter in a term
     * value field while `current` is empty) applies the expression right away.
     * MolSelList commits + closes its popover here; falls back to `onApply`.
     */
    onQuickApply?: (expr: string) => void;
    /**
     * Target molecule's applied selection, listed under "Selected" in the
     * Named tab (independent of `current`, which MolSelList sets to the field
     * value).
     */
    namedCurrentSel?: string;
    /** Recently used expressions, newest first (History source). */
    history?: string[];
    /** Scene-level named selection defs (StyleManager). */
    sceneDefs?: string[];
    /** Global named selection defs (StyleManager). */
    globalDefs?: string[];
    /** Resolve candidate values for a keyword from the active molecule. */
    resolveValues?: ResolveValues;
    /** Read-only resolver: expression -> matched-atom count. */
    getHitCount?: GetHitCount;
    disabled?: boolean;
}

/* --- Tabs --- */

type BuilderTab = 'named' | 'history' | 'term' | 'modify';

const TAB_OPTIONS: SegmentFieldOption<BuilderTab>[] = [
    { label: 'Named', value: 'named' },
    { label: 'History', value: 'history' },
    { label: 'Term', value: 'term' },
    { label: 'Mod', value: 'modify' },
];

/* --- Op tables --- */

// Set-operation icons: import = replace the current with the term, plus/minus
// = union/difference, intersection = the overlap. `label` is the abbreviated
// button text; `full` is the tooltip.
const BINARY_OPS: { op: BinaryOp; label: string; full: string; icon: AppIconKey }[] = [
    { op: 'set', label: 'Set', full: 'Set (replace)', icon: 'ui.import' },
    { op: 'add', label: 'Add', full: 'Add (union)', icon: 'ui.add' },
    { op: 'sub', label: 'Sub', full: 'Subtract', icon: 'ui.remove' },
    { op: 'intersect', label: 'Intsec', full: 'Intersect', icon: 'ui.intersect' },
];

const MODIFY_OPS: { op: UnaryOp; label: string; full: string }[] = [
    { op: 'not', label: 'Invert', full: 'Invert' },
    { op: 'byres', label: 'Byres', full: 'By residue' },
    { op: 'sidechain', label: 'Sidech', full: 'Sidechain' },
    { op: 'mainchain', label: 'Mainch', full: 'Mainchain' },
];

const DIST_OPS: { op: UnaryOp; label: string; full: string }[] = [
    { op: 'around', label: 'Arnd', full: 'Around' },
    { op: 'expand', label: 'Expn', full: 'Expand' },
];

// Preset Around/Expand radii (Angstrom), chosen from a compact dropdown. The
// radius is a small contact-shell distance and never reaches three digits.
const DISTANCE_OPTIONS = ['3', '4', '5', '6', '8', '10'];

const VALUE_LIST_EMPTY: string[] = [];

/* --- Component --- */

export const SelectionBuilder: React.FC<SelectionBuilderProps> = ({
    current,
    draft,
    dispatch,
    onApply,
    onQuickApply,
    namedCurrentSel,
    history = [],
    sceneDefs = [],
    globalDefs = [],
    resolveValues,
    getHitCount,
    disabled,
}) => {
    const keywordDef = getKeywordDef(draft.keyword);
    const term = selectTerm(draft);

    // Local: each fresh mount (popover open) starts on the frequent path.
    const [tab, setTab] = useState<BuilderTab>('named');

    const applyImmediate = onQuickApply ?? onApply;
    const currentEmpty = current.trim() === '';

    // Named / History tab click: always apply as a replacement right away (the
    // one-click pick, like the legacy UXP dropdown). Combining into the
    // current selection goes through the Builder tab's Named / History
    // keywords instead.
    const handleQuickPick = (value: string): void => {
        if (!disabled) applyImmediate(value);
    };
    // Highlight the list entry matching the applied/field value, if any.
    const activeQuickValue = currentEmpty ? undefined : current.trim();

    // Enter in a term value field: apply directly, but only while current is
    // empty -- with a selection in place a silent replace would be surprising,
    // so the explicit op buttons stay the only path there.
    const onTermKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key !== 'Enter' || !currentEmpty || term === null) return;
        applyImmediate(term);
    };

    // --- Autocomplete values for the active keyword ---
    const [suggestItems, setSuggestItems] = useState<string[]>(VALUE_LIST_EMPTY);
    useEffect(() => {
        const kind = keywordDef.autocomplete;
        if (!kind || !resolveValues) {
            setSuggestItems(VALUE_LIST_EMPTY);
            return;
        }
        let cancelled = false;
        resolveValues(kind)
            .then((vals) => {
                if (!cancelled) setSuggestItems(vals);
            })
            .catch(() => {
                if (!cancelled) setSuggestItems(VALUE_LIST_EMPTY);
            });
        return () => {
            cancelled = true;
        };
    }, [keywordDef.autocomplete, resolveValues]);

    const setField = (name: string, v: string): void =>
        dispatch({ type: 'SET_FIELD', name, value: v });

    const onBinary = (op: BinaryOp): void => {
        if (term !== null && canApplyBinary(current, op)) onApply(applyBinary(current, term, op));
    };
    const onUnary = (op: UnaryOp): void => {
        if (canApplyUnary(draft, op, current)) onApply(applyUnary(current, op, draft.distance));
    };

    /* -- Value input, keyword-dependent -- */
    const valueInput = useMemo(() => {
        switch (keywordDef.valueKind) {
            case 'none':
                return null;
            case 'compare':
                return (
                    <div className="selbuilder-term-form">
                        <SelectField
                            value={draft.fields.op ?? '<'}
                            disabled={disabled}
                            fill={false}
                            aria-label="Comparison operator"
                            onChange={(v) => setField('op', v)}
                        >
                            <option value="<">{'<'}</option>
                            <option value=">">{'>'}</option>
                            <option value="=">{'='}</option>
                        </SelectField>
                        <TextField
                            value={draft.fields.value ?? ''}
                            disabled={disabled}
                            onChange={(v) => setField('value', v)}
                            onKeyDown={onTermKeyDown}
                            placeholder="value"
                        />
                    </div>
                );
            case 'nameValue':
                return (
                    <div className="selbuilder-term-form">
                        <TextField
                            value={draft.fields.name ?? ''}
                            disabled={disabled}
                            onChange={(v) => setField('name', v)}
                            onKeyDown={onTermKeyDown}
                            placeholder="property"
                        />
                        <span className="selbuilder-sep">=</span>
                        <TextField
                            value={draft.fields.value ?? ''}
                            disabled={disabled}
                            onChange={(v) => setField('value', v)}
                            onKeyDown={onTermKeyDown}
                            placeholder="value"
                        />
                    </div>
                );
            case 'hierarchical':
                return (
                    <div className="selbuilder-term-form">
                        <TextField
                            value={draft.fields.chain ?? ''}
                            disabled={disabled}
                            onChange={(v) => setField('chain', v)}
                            onKeyDown={onTermKeyDown}
                            placeholder="chain"
                        />
                        <TextField
                            value={draft.fields.resid ?? ''}
                            disabled={disabled}
                            onChange={(v) => setField('resid', v)}
                            onKeyDown={onTermKeyDown}
                            placeholder="resid"
                        />
                        <TextField
                            value={draft.fields.aname ?? ''}
                            disabled={disabled}
                            onChange={(v) => setField('aname', v)}
                            onKeyDown={onTermKeyDown}
                            placeholder="atom"
                        />
                    </div>
                );
            case 'named':
                // Pick a named selection from the space beside the keyword:
                // scene-level then global (built-in macro) defs.
                return (
                    <div className="selbuilder-term-form selbuilder-term-pick">
                        <SelectField
                            value={draft.picked}
                            disabled={disabled}
                            aria-label="Named selection"
                            onChange={(v) => dispatch({ type: 'SET_PICKED', value: v })}
                        >
                            <option value="" disabled>
                                Select named...
                            </option>
                            {sceneDefs.length > 0 && (
                                <optgroup label="Scene">
                                    {sceneDefs.map((v) => (
                                        <option key={`s-${v}`} value={v}>
                                            {v}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                            {globalDefs.length > 0 && (
                                <optgroup label="Global">
                                    {globalDefs.map((v) => (
                                        <option key={`g-${v}`} value={v}>
                                            {v}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                        </SelectField>
                    </div>
                );
            case 'history':
                // Pick a recently used expression from the space beside the keyword.
                return (
                    <div className="selbuilder-term-form selbuilder-term-pick">
                        <SelectField
                            value={draft.picked}
                            disabled={disabled}
                            aria-label="History"
                            onChange={(v) => dispatch({ type: 'SET_PICKED', value: v })}
                        >
                            <option value="" disabled>
                                Select history...
                            </option>
                            {history.map((h, i) => (
                                <option key={i} value={h}>
                                    {h}
                                </option>
                            ))}
                        </SelectField>
                    </div>
                );
            default:
                // nameList / numList -- single value field with autocomplete.
                return (
                    <div className="selbuilder-term-form">
                        <ComboBoxField
                            value={draft.fields.value ?? ''}
                            disabled={disabled}
                            onChange={(v) => setField('value', v)}
                            onPick={(v) => setField('value', v)}
                            onKeyDown={onTermKeyDown}
                            options={suggestItems}
                            placeholder={keywordDef.valueKind === 'numList' ? '1:10, 20' : 'value'}
                            triggerTitle="Show candidate values"
                        />
                    </div>
                );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        keywordDef,
        draft.fields,
        draft.picked,
        suggestItems,
        disabled,
        sceneDefs,
        globalDefs,
        history,
        currentEmpty,
        term,
    ]);

    return (
        <div className={`selbuilder${disabled ? ' selbuilder--disabled' : ''}`}>
            <SegmentField<BuilderTab>
                value={tab}
                onValueChange={setTab}
                options={TAB_OPTIONS}
                compact
                disabled={disabled}
            />

            {/* Named / History: ready-made expressions, one click applies. */}
            {tab === 'named' && (
                <NamedSelMenu
                    currentSel={namedCurrentSel}
                    sceneDefs={sceneDefs}
                    globalDefs={globalDefs}
                    activeValue={activeQuickValue}
                    onPick={handleQuickPick}
                />
            )}
            {tab === 'history' && (
                <HistoryMenu
                    history={history}
                    activeValue={activeQuickValue}
                    onPick={handleQuickPick}
                />
            )}

            {/* Term: build/pick an operand and apply it via binary set ops.
                The keyword dropdown lists property keywords plus Named /
                History; the value area beside it adapts to the chosen
                keyword. The tab label is the section heading. */}
            {tab === 'term' && (
                <div className="selbuilder-main">
                    <div className="selbuilder-property">
                        <SelectField
                            value={draft.keyword}
                            disabled={disabled}
                            fill={false}
                            aria-label="Term keyword"
                            onChange={(v) =>
                                dispatch({ type: 'SET_KEYWORD', keyword: v as Keyword })
                            }
                        >
                            {KEYWORDS.map((k) => (
                                <option key={k.key} value={k.key} title={k.full ?? k.label}>
                                    {k.label}
                                </option>
                            ))}
                        </SelectField>
                        {valueInput}
                    </div>

                    {/* Apply the term into the current selection. A 2x2 grid of
                        labelled buttons; each shows the resulting hit count as
                        a badge and the full op name as a tooltip. */}
                    <div className="selbuilder-apply">
                        <span className="type-label selbuilder-field-label">Apply</span>
                        <div className="selbuilder-op-grid">
                            {BINARY_OPS.map((b) => {
                                const preview =
                                    term !== null && canApplyBinary(current, b.op)
                                        ? applyBinary(current, term, b.op)
                                        : null;
                                return (
                                    <OpButton
                                        key={b.op}
                                        label={b.label}
                                        title={b.full}
                                        icon={b.icon}
                                        preview={preview}
                                        getHitCount={getHitCount}
                                        enabled={!disabled}
                                        onClick={() => onBinary(b.op)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Mod: unary transforms of the current selection (no term). */}
            {tab === 'modify' && (
                <div className="selbuilder-main">
                    <div className="selbuilder-op-grid">
                        {MODIFY_OPS.map((m) => {
                            const preview = canApplyUnary(draft, m.op, current)
                                ? applyUnary(current, m.op, draft.distance)
                                : null;
                            return (
                                <OpButton
                                    key={m.op}
                                    label={m.label}
                                    title={m.full}
                                    preview={preview}
                                    getHitCount={getHitCount}
                                    enabled={!disabled}
                                    onClick={() => onUnary(m.op)}
                                />
                            );
                        })}
                    </div>
                    <div className="selbuilder-distance-row">
                        {DIST_OPS.map((d) => {
                            const preview = canApplyUnary(draft, d.op, current)
                                ? applyUnary(current, d.op, draft.distance)
                                : null;
                            return (
                                <OpButton
                                    key={d.op}
                                    label={d.label}
                                    title={d.full}
                                    preview={preview}
                                    getHitCount={getHitCount}
                                    enabled={!disabled}
                                    onClick={() => onUnary(d.op)}
                                />
                            );
                        })}
                        <span className="selbuilder-distance">
                            <SelectField
                                value={draft.distance}
                                disabled={disabled}
                                aria-label="Distance (Angstrom)"
                                onChange={(v) => dispatch({ type: 'SET_DISTANCE', value: v })}
                            >
                                {DISTANCE_OPTIONS.map((d) => (
                                    <option key={d} value={d}>
                                        {d}
                                    </option>
                                ))}
                            </SelectField>
                        </span>
                        <span className="type-caption selbuilder-unit">{'Å'}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

/* --- Action button with post-apply hit count --- */

interface OpButtonProps {
    label: string;
    /** Full-name tooltip (defaults to the label). */
    title?: string;
    icon?: AppIconKey;
    /** The would-be expression after applying, or null when not applicable. */
    preview: string | null;
    getHitCount?: GetHitCount;
    enabled: boolean;
    onClick: () => void;
}

/**
 * A compose/transform button: an (optional) icon, the abbreviated label, and an
 * inline badge previewing the resulting hit count so the user does not
 * accidentally build an empty selection. The full op name shows in a canonical
 * (h3-kit) tooltip -- the same tooltip shape used everywhere. Disabled when the
 * op is not applicable (e.g. Add on an empty current selection).
 */
const OpButton: React.FC<OpButtonProps> = ({
    label,
    title,
    icon,
    preview,
    getHitCount,
    enabled,
    onClick,
}) => {
    const applicable = enabled && preview !== null;
    const count = useSelHitCount(getHitCount, applicable ? preview : null, enabled);
    return (
        <Tooltip content={title ?? label}>
            <FormButton
                className="selbuilder-op-btn"
                disabled={!applicable}
                onClick={onClick}
                icon={icon ? <AppIcon name={icon} aria-hidden /> : undefined}
            >
                <span className="selbuilder-op-label">{label}</span>
                <CountTag count={count} />
            </FormButton>
        </Tooltip>
    );
};
