/**
 * @file components/panes/selection/SelectionBuilder.tsx
 * @description Inline UI for composing CueMol selection expressions without
 * typing the grammar. Lives in the SelectionPane.
 *
 * ## Model
 *
 * The "current selection" is the target molecule's `mol.sel` (single source of
 * truth), passed in as `current`. The builder never owns it: a "term" (from one
 * of three sources -- a Property keyword+value, a Named def, or a History
 * entry) is combined into the current selection via binary set operations
 * (Replace / Add / Subtract / Intersect), and the current selection is reshaped
 * by unary transforms (Invert / Byres / Sidechain / Mainchain / Around /
 * Expand). Every button computes the resulting expression and hands it to
 * `onApply`, which the container writes straight to `mol.sel` (live). Logical
 * operators are never typed by the user.
 *
 * The operand draft (`draft` / `dispatch`) is controlled by the container so it
 * can be persisted across side-panel activity-group switches. There is no
 * builder-local undo/redo -- stepping back is the scene undo (Cmd+Z).
 *
 * ## variant
 *
 * `full` (Selection pane): one function per row (grows downward), and the Named
 * / History sources expand an inline listbox directly under the source segment
 * -- symmetric with the Property source. `compact` (space-constrained reuse,
 * e.g. a future MolSelList widget): 2x2 button grids and a popover picker for
 * Named / History. Behaviour is identical across variants; only layout density
 * differs.
 *
 * Every action button shows the would-be hit count so the user can predict the
 * result before applying.
 *
 * Grammar reference: `src/modules/molstr/parser_sel.yxx` / `scanner_sel.lxx`
 * (see selectionExpr.ts / selectionGrammar.ts).
 *
 * @module SelectionBuilder
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Popover } from '@blueprintjs/core';
import { AppIcon } from '../../AppIcon';
import type { AppIconKey } from '../../../data/appIcons';
import {
    ComboBoxField,
    FieldSection,
    FormButton,
    SegmentField,
    SelectField,
    TextField,
} from '../../../h3-kit/form';
import { useTheme } from '../../../contexts/ThemeContext';
import type { ResolveValues } from './useSelectionValues';
import { KEYWORDS, getKeywordDef, type Keyword } from './selectionGrammar';
import type { BinaryOp, UnaryOp } from './selectionExpr';
import { applyBinary, applyUnary, canApplyBinary } from './selectionExpr';
import type { BuilderState, BuilderAction, TermSource } from './selBuilderReducer';
import { canApplyUnary, selectTerm } from './selBuilderReducer';
import { useSelHitCount, type GetHitCount } from '../../../h3-kit/MolSelList/useSelHitCount';
import { CountTag } from '../../../h3-kit/MolSelList/CountTag';
import {
    HistoryList,
    HistoryMenu,
    NamedSelList,
    NamedSelMenu,
} from '../../../h3-kit/MolSelList/SelMenus';

/* --- Props --- */

export interface SelectionBuilderProps {
    /** Layout density (default `full`). */
    variant?: 'full' | 'compact';
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

const VALUE_LIST_EMPTY: string[] = [];

/* --- Component --- */

export const SelectionBuilder: React.FC<SelectionBuilderProps> = ({
    variant = 'full',
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
    const compact = variant === 'compact';
    const keywordDef = getKeywordDef(draft.keyword);
    const term = selectTerm(draft);
    const currentSel = current.trim() === '' ? undefined : current;

    // Named/History term list is shown in a Popover (compact) so a long list
    // never pushes the Apply buttons off-screen; the portal needs the theme
    // class because it mounts outside the themed app root.
    const [pickerOpen, setPickerOpen] = useState(false);
    const { theme } = useTheme();
    const portalClassName = theme === 'dark' ? 'bp5-dark' : '';

    // --- Autocomplete values for the active Property keyword ---
    const [suggestItems, setSuggestItems] = useState<string[]>(VALUE_LIST_EMPTY);
    useEffect(() => {
        const kind = keywordDef.autocomplete;
        if (draft.source !== 'property' || !kind || !resolveValues) {
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
    }, [draft.source, keywordDef.autocomplete, resolveValues]);

    const setField = (name: string, v: string): void =>
        dispatch({ type: 'SET_FIELD', name, value: v });

    const onSourceChange = (v: TermSource): void => {
        dispatch({ type: 'SET_SOURCE', source: v });
        // Compact keeps a popover picker; open it immediately on switch so the
        // list is one step (full expands an inline listbox, no popover).
        if (compact) setPickerOpen(v === 'named' || v === 'history');
    };

    const onBinary = (op: BinaryOp): void => {
        if (term !== null && canApplyBinary(current, op)) onApply(applyBinary(current, term, op));
    };
    const onUnary = (op: UnaryOp): void => {
        if (canApplyUnary(draft, op, current)) onApply(applyUnary(current, op, draft.distance));
    };

    const onPickTerm = (v: string): void => {
        dispatch({ type: 'SET_PICKED', value: v });
        if (compact) setPickerOpen(false);
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
    }, [keywordDef, draft.fields, suggestItems, disabled]);

    const opListClass = compact ? 'selbuilder-op-grid' : 'selbuilder-op-col';

    return (
        <div className={`selbuilder selbuilder--${variant}${disabled ? ' selbuilder--disabled' : ''}`}>
            {/* Term: build/pick an operand and apply it via binary set ops. */}
            <FieldSection title="Term">
                <SegmentField
                    value={draft.source}
                    onValueChange={onSourceChange}
                    options={[
                        { label: 'Prop', value: 'property' },
                        { label: 'Named', value: 'named' },
                        { label: 'History', value: 'history' },
                    ]}
                />
                {draft.source === 'property' && (
                    <div className="selbuilder-property">
                        <SelectField
                            value={draft.keyword}
                            disabled={disabled}
                            fill={false}
                            aria-label="Property keyword"
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
                )}
                {(draft.source === 'named' || draft.source === 'history') &&
                    (compact ? (
                        <Popover
                            isOpen={pickerOpen}
                            onInteraction={setPickerOpen}
                            placement="bottom-start"
                            portalClassName={portalClassName}
                            fill
                            disabled={disabled}
                            content={
                                <div className="selbuilder-term-popover">
                                    {draft.source === 'named' ? (
                                        <NamedSelMenu
                                            currentSel={currentSel}
                                            sceneDefs={sceneDefs}
                                            globalDefs={globalDefs}
                                            activeValue={draft.picked}
                                            onPick={onPickTerm}
                                            dismissOnPick
                                        />
                                    ) : (
                                        <HistoryMenu
                                            history={history}
                                            activeValue={draft.picked}
                                            onPick={onPickTerm}
                                            dismissOnPick
                                        />
                                    )}
                                </div>
                            }
                        >
                            <Button
                                fill
                                alignText="left"
                                rightIcon={<span className="h3-form-caret" aria-hidden />}
                                className="selbuilder-term-trigger h3-form-btn h3-form-dropdown-caret"
                                disabled={disabled}
                                text={
                                    draft.picked ||
                                    (draft.source === 'named' ? 'Select named...' : 'Select history...')
                                }
                            />
                        </Popover>
                    ) : (
                        <div className="selbuilder-sourcelist">
                            {draft.source === 'named' ? (
                                <NamedSelList
                                    currentSel={currentSel}
                                    sceneDefs={sceneDefs}
                                    globalDefs={globalDefs}
                                    activeValue={draft.picked}
                                    onPick={onPickTerm}
                                />
                            ) : (
                                <HistoryList
                                    history={history}
                                    activeValue={draft.picked}
                                    onPick={onPickTerm}
                                />
                            )}
                        </div>
                    ))}

                {/* Apply the term into the current selection (child of Term). */}
                <div className="selbuilder-apply">
                    <span className="type-label selbuilder-field-label">Apply</span>
                    <div className={opListClass}>
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
                <div className={opListClass}>
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
                        <TextField
                            value={draft.distance}
                            disabled={disabled}
                            onChange={(v) => dispatch({ type: 'SET_DISTANCE', value: v })}
                            placeholder="0"
                            fill={false}
                        />
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
        <FormButton
            className="selbuilder-op-btn"
            title={title ?? label}
            disabled={!applicable}
            onClick={onClick}
            icon={icon ? <AppIcon name={icon} aria-hidden /> : undefined}
        >
            <span className="selbuilder-op-label">{label}</span>
            <CountTag count={count} />
        </FormButton>
    );
};
