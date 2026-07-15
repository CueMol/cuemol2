/**
 * @file components/panes/selection/SelectionBuilder.tsx
 * @description Inline UI for composing CueMol selection expressions without
 * typing the grammar. Lives in the SelectionPane.
 *
 * ## Model
 *
 * The "current selection" is the target molecule's `mol.sel` (single source of
 * truth), passed in as `current`. The builder never owns it: a "term" is picked
 * from a single keyword dropdown -- a property keyword (compose `keyword value`
 * syntax) or the `Named` / `History` keywords (pick a ready-made expression from
 * the candidate dropdown beside it). The term is combined into the current
 * selection via binary set operations (Replace / Add / Subtract / Intersect),
 * and the current selection is reshaped by unary transforms (Invert / Byres /
 * Sidechain / Mainchain / Around / Expand). Every button computes the resulting
 * expression and hands it to `onApply`, which the container writes straight to
 * `mol.sel` (live). Logical operators are never typed by the user.
 *
 * The operand draft (`draft` / `dispatch`) is controlled by the container so it
 * can be persisted across side-panel activity-group switches. There is no
 * builder-local undo/redo -- stepping back is the scene undo (Cmd+Z).
 *
 * Apply is a single row of four icon-only buttons (the set-op name is the
 * tooltip); Modify is a 2x2 grid. Every action button shows the would-be hit
 * count so the user can predict the result before applying.
 *
 * Grammar reference: `src/modules/molstr/parser_sel.yxx` / `scanner_sel.lxx`
 * (see selectionExpr.ts / selectionGrammar.ts).
 *
 * @module SelectionBuilder
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Tooltip } from '@blueprintjs/core';
import { AppIcon } from '../../AppIcon';
import type { AppIconKey } from '../../../data/appIcons';
import {
    ComboBoxField,
    FieldSection,
    FormButton,
    SelectField,
    TextField,
} from '../../../h3-kit/form';
import type { ResolveValues } from './useSelectionValues';
import { KEYWORDS, getKeywordDef, type Keyword } from './selectionGrammar';
import type { BinaryOp, UnaryOp } from './selectionExpr';
import { applyBinary, applyUnary, canApplyBinary } from './selectionExpr';
import type { BuilderState, BuilderAction } from './selBuilderReducer';
import { canApplyUnary, selectTerm } from './selBuilderReducer';
import { useSelHitCount, type GetHitCount } from '../../../h3-kit/MolSelList/useSelHitCount';
import { CountTag } from '../../../h3-kit/MolSelList/CountTag';

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

/* --- Op tables --- */

// Set-operation icons: import = replace the current with the term, plus/minus
// = union/difference, intersection = the overlap.
const BINARY_OPS: { op: BinaryOp; label: string; icon: AppIconKey }[] = [
    { op: 'set', label: 'Replace', icon: 'ui.import' },
    { op: 'add', label: 'Add', icon: 'ui.add' },
    { op: 'sub', label: 'Subtract', icon: 'ui.remove' },
    { op: 'intersect', label: 'Intersect', icon: 'ui.intersect' },
];

const MODIFY_OPS: { op: UnaryOp; label: string }[] = [
    { op: 'not', label: 'Invert' },
    { op: 'byres', label: 'Byres' },
    { op: 'sidechain', label: 'Sidechain' },
    { op: 'mainchain', label: 'Mainchain' },
];

const DIST_OPS: { op: UnaryOp; label: string }[] = [
    { op: 'around', label: 'Around' },
    { op: 'expand', label: 'Expand' },
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
    history = [],
    sceneDefs = [],
    globalDefs = [],
    resolveValues,
    getHitCount,
    disabled,
}) => {
    const keywordDef = getKeywordDef(draft.keyword);
    const term = selectTerm(draft);

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
                            placeholder="property"
                        />
                        <span className="selbuilder-sep">=</span>
                        <TextField
                            value={draft.fields.value ?? ''}
                            disabled={disabled}
                            onChange={(v) => setField('value', v)}
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
                            placeholder="chain"
                        />
                        <TextField
                            value={draft.fields.resid ?? ''}
                            disabled={disabled}
                            onChange={(v) => setField('resid', v)}
                            placeholder="resid"
                        />
                        <TextField
                            value={draft.fields.aname ?? ''}
                            disabled={disabled}
                            onChange={(v) => setField('aname', v)}
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
    ]);

    return (
        <div className={`selbuilder${disabled ? ' selbuilder--disabled' : ''}`}>
            {/* Term: build/pick an operand and apply it via binary set ops. The
                keyword dropdown lists property keywords plus Named / History;
                the value area beside it adapts to the chosen keyword. */}
            <FieldSection title="Term">
                <div className="selbuilder-property">
                    <SelectField
                        value={draft.keyword}
                        disabled={disabled}
                        fill={false}
                        aria-label="Term keyword"
                        onChange={(v) => dispatch({ type: 'SET_KEYWORD', keyword: v as Keyword })}
                    >
                        {KEYWORDS.map((k) => (
                            <option key={k.key} value={k.key} title={k.full ?? k.label}>
                                {k.label}
                            </option>
                        ))}
                    </SelectField>
                    {valueInput}
                </div>

                {/* Apply the term into the current selection (child of Term).
                    Icon-only buttons in a single row; the set-op name is the
                    tooltip and the badge previews the resulting hit count. */}
                <div className="selbuilder-apply">
                    <span className="type-label selbuilder-field-label">Apply</span>
                    <div className="selbuilder-op-row">
                        {BINARY_OPS.map((b) => {
                            const preview =
                                term !== null && canApplyBinary(current, b.op)
                                    ? applyBinary(current, term, b.op)
                                    : null;
                            return (
                                <OpButton
                                    key={b.op}
                                    label={b.label}
                                    icon={b.icon}
                                    iconOnly
                                    preview={preview}
                                    getHitCount={getHitCount}
                                    enabled={!disabled}
                                    onClick={() => onBinary(b.op)}
                                />
                            );
                        })}
                    </div>
                </div>
            </FieldSection>

            {/* Modify: unary transforms of the current selection (peer of Term). */}
            <FieldSection title="Modify">
                <div className="selbuilder-op-grid">
                    {MODIFY_OPS.map((m) => {
                        const preview = canApplyUnary(draft, m.op, current)
                            ? applyUnary(current, m.op, draft.distance)
                            : null;
                        return (
                            <OpButton
                                key={m.op}
                                label={m.label}
                                preview={preview}
                                getHitCount={getHitCount}
                                enabled={!disabled}
                                onClick={() => onUnary(m.op)}
                            />
                        );
                    })}
                </div>
                <div className="selbuilder-distance-row">
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
                    {DIST_OPS.map((d) => {
                        const preview = canApplyUnary(draft, d.op, current)
                            ? applyUnary(current, d.op, draft.distance)
                            : null;
                        return (
                            <OpButton
                                key={d.op}
                                label={d.label}
                                countInTooltip
                                preview={preview}
                                getHitCount={getHitCount}
                                enabled={!disabled}
                                onClick={() => onUnary(d.op)}
                            />
                        );
                    })}
                </div>
            </FieldSection>
        </div>
    );
};

/* --- Action button with post-apply hit count --- */

interface OpButtonProps {
    label: string;
    /** Hover tooltip (defaults to label). */
    title?: string;
    icon?: AppIconKey;
    /** Render the icon only (no label); the label moves to the tooltip. */
    iconOnly?: boolean;
    /** Move the hit count from the inline badge into the tooltip (saves width). */
    countInTooltip?: boolean;
    /** The would-be expression after applying, or null when not applicable. */
    preview: string | null;
    getHitCount?: GetHitCount;
    enabled: boolean;
    onClick: () => void;
}

/**
 * A compose/transform button showing the would-be hit count after applying it,
 * so the user does not accidentally build an empty selection. Disabled when the
 * op is not applicable (e.g. Add on an empty current selection).
 *
 * The count shows in an inline badge by default. Where a badge does not fit --
 * the 4-up Apply row (`iconOnly`) and the Around/Expand row (`countInTooltip`)
 * -- the label + resulting atom count fold into a Blueprint Tooltip instead.
 */
const OpButton: React.FC<OpButtonProps> = ({
    label,
    title,
    icon,
    iconOnly = false,
    countInTooltip = false,
    preview,
    getHitCount,
    enabled,
    onClick,
}) => {
    const applicable = enabled && preview !== null;
    const count = useSelHitCount(getHitCount, applicable ? preview : null, enabled);
    // A native `title` is unreliable here -- Electron suppresses it over some
    // regions and it never shows on a disabled button (ops are disabled until a
    // term is composed) -- so a folded count uses a Blueprint Tooltip (portal).
    const useTooltip = iconOnly || countInTooltip;
    const countSuffix = typeof count === 'number' ? ` (${count} atoms)` : '';
    const btn = (
        <FormButton
            className={`selbuilder-op-btn${iconOnly ? ' selbuilder-op-btn--icon' : ''}`}
            title={useTooltip ? undefined : (title ?? label)}
            aria-label={iconOnly ? label : undefined}
            disabled={!applicable}
            onClick={onClick}
            icon={icon ? <AppIcon name={icon} aria-hidden /> : undefined}
        >
            {!iconOnly && <span className="selbuilder-op-label">{label}</span>}
            {!iconOnly && !countInTooltip && <CountTag count={count} />}
        </FormButton>
    );
    if (!useTooltip) return btn;
    return (
        <Tooltip content={`${label}${countSuffix}`} placement="bottom" compact>
            {btn}
        </Tooltip>
    );
};
