/**
 * @file components/widgets/MolSelList/SelectionBuilder.tsx
 * @description Inline UI for composing CueMol selection-syntax expressions
 * without memorising the grammar. Lives in the SelectionPane.
 *
 * ## Model
 *
 * A single "current selection" expression is the target of every operation.
 * A "term" (from one of three sources) is combined into it via binary set
 * operations (Set / Add / Intersect / Sub); the current selection itself is
 * reshaped by unary transforms (Not / Byres / Sidechain / Mainchain /
 * Around / Expand). "Define name..." names the current selection so it can be
 * reused as a parenthesised sub-expression. Logical operators are never typed
 * by the user -- they are produced by these buttons.
 *
 * Two-way: the builder is a controlled editor of the parent's selection text.
 * The container seeds the current selection via `value` and the current
 * expression is mirrored back via `onEmit` in real time. External edits to
 * `value` (manual text typing, Clear, History pick) re-seed the builder; the
 * `value !== current` guard prevents an emit/re-seed loop and preserves the
 * builder-local undo history across applied operations. The builder never
 * mutates `mol.sel` or touches the scene undo history; selection commits stay
 * the container's job (SelectionPane's Select button). Hit counts are
 * read-only probes.
 *
 * Grammar reference: `src/modules/molstr/parser_sel.yxx` / `scanner_sel.lxx`
 * (see selectionExpr.ts / selectionGrammar.ts).
 *
 * @module SelectionBuilder
 */

import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Button, ButtonGroup, HTMLSelect, InputGroup, Popover } from '@blueprintjs/core';
import { SegmentField } from '../form';
import { useTheme } from '../../../contexts/ThemeContext';
import type { ResolveValues } from './useSelectionValues';
import { KEYWORDS, getKeywordDef } from './selectionGrammar';
import type { BinaryOp, UnaryOp } from './selectionExpr';
import { applyBinary, canApplyBinary } from './selectionExpr';
import {
    builderReducer,
    canApplyUnary,
    canRedo,
    canUndo,
    initBuilderState,
    selectTerm,
} from './selBuilderReducer';
import { useSelHitCount, type GetHitCount } from './useSelHitCount';
import { CountTag } from './CountTag';
import { HistoryMenu, NamedSelMenu } from './SelMenus';

/* --- Props --- */

export interface SelectionBuilderProps {
    /** Seed expression for the current selection (container-provided). */
    value: string;
    /** Emit the current expression to the parent (writes its text box). */
    onEmit: (expr: string) => void;
    /** Recently used expressions, newest first (History source). */
    history?: string[];
    /** Target molecule's current selection (Named source "Selected" item). */
    currentSel?: string;
    /** Scene-level named selection defs (StyleManager). */
    sceneDefs?: string[];
    /** Global named selection defs (StyleManager). */
    globalDefs?: string[];
    /** Resolve candidate values for a keyword from the active molecule. */
    resolveValues?: ResolveValues;
    /** Read-only resolver: expression -> matched-atom count. */
    getHitCount?: GetHitCount;
    /** Persist the current selection under a name ("Define name..."). */
    onSaveAs?: (name: string, expr: string) => Promise<boolean> | void;
    disabled?: boolean;
}

/* --- Component --- */

const VALUE_LIST_ID = 'selbuilder-value-list';

/** Blueprint icon identifier (or element), as accepted by Button's `icon`. */
type IconId = React.ComponentProps<typeof Button>['icon'];

// Set-operation icons: import = load/overwrite the current with the term,
// plus/minus = union/difference, intersection = the overlap. `full` is the
// hover tooltip for an abbreviated label.
const BINARY_OPS: { op: BinaryOp; label: string; full?: string; icon: IconId }[] = [
    { op: 'set', label: 'Set', icon: 'import' },
    { op: 'add', label: 'Add', icon: 'plus' },
    { op: 'intersect', label: 'Isec', full: 'Intersect', icon: 'intersection' },
    { op: 'sub', label: 'Sub', icon: 'minus' },
];

const MODIFY_OPS: { op: UnaryOp; label: string; full?: string }[] = [
    { op: 'not', label: 'Not' },
    { op: 'byres', label: 'Byres' },
    { op: 'sidechain', label: 'Sidech', full: 'Sidechain' },
    { op: 'mainchain', label: 'Mainch', full: 'Mainchain' },
];

export const SelectionBuilder: React.FC<SelectionBuilderProps> = ({
    value,
    onEmit,
    history = [],
    currentSel,
    sceneDefs = [],
    globalDefs = [],
    resolveValues,
    getHitCount,
    onSaveAs,
    disabled,
}) => {
    const [state, dispatch] = useReducer(builderReducer, value, initBuilderState);

    // Named/History term lists are shown in a Popover (portal) so a long list
    // never pushes the Apply-term buttons off-screen. Theme class is needed
    // because the portal is mounted outside the themed app root.
    const [pickerOpen, setPickerOpen] = useState(false);
    const { theme } = useTheme();
    const portalClassName = theme === 'dark' ? 'bp5-dark' : '';

    const keywordDef = getKeywordDef(state.keyword);
    const term = selectTerm(state);

    // --- Two-way sync with the parent's selection text ---
    // Mirror the current expression out on every change.
    useEffect(() => {
        onEmit(state.current);
    }, [state.current, onEmit]);

    // Re-seed from external edits (manual typing, Clear, History pick). The
    // guard skips the no-op case after our own emit round-trips back, so the
    // builder-local undo history survives applied operations -- only a genuine
    // external change starts a fresh session.
    useEffect(() => {
        if (value !== state.current) dispatch({ type: 'SET_CURRENT', value });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // --- Autocomplete values for the active Property keyword ---
    const [suggestItems, setSuggestItems] = useState<string[]>([]);
    useEffect(() => {
        const kind = keywordDef.autocomplete;
        if (state.source !== 'property' || !kind || !resolveValues) {
            setSuggestItems([]);
            return;
        }
        let cancelled = false;
        resolveValues(kind)
            .then((vals) => {
                if (!cancelled) setSuggestItems(vals);
            })
            .catch(() => {
                if (!cancelled) setSuggestItems([]);
            });
        return () => {
            cancelled = true;
        };
    }, [state.source, keywordDef.autocomplete, resolveValues]);

    // --- Define a named selection (StyleManager 'sel' def, not a disk file) ---
    const [defining, setDefining] = useState(false);
    const [defName, setDefName] = useState('');
    const onConfirmDefine = useCallback(() => {
        const name = defName.trim();
        if (name === '' || state.current.trim() === '' || !onSaveAs) return;
        void Promise.resolve(onSaveAs(name, state.current));
        setDefining(false);
        setDefName('');
    }, [defName, state.current, onSaveAs]);

    const setField = (name: string, v: string) => dispatch({ type: 'SET_FIELD', name, value: v });

    /* -- Value input, keyword-dependent -- */
    const valueInput = useMemo(() => {
        switch (keywordDef.valueKind) {
            case 'none':
                return null;
            case 'compare':
                return (
                    <div className="selbuilder-term-form">
                        <HTMLSelect
                            className="fk-select"
                            value={state.fields.op ?? '<'}
                            disabled={disabled}
                            onChange={(e) => setField('op', e.target.value)}
                            options={[
                                { value: '<', label: '<' },
                                { value: '>', label: '>' },
                                { value: '=', label: '=' },
                            ]}
                        />
                        <InputGroup
                            value={state.fields.value ?? ''}
                            disabled={disabled}
                            onChange={(e) => setField('value', e.target.value)}
                            placeholder="value"
                        />
                    </div>
                );
            case 'nameValue':
                return (
                    <div className="selbuilder-term-form">
                        <InputGroup
                            value={state.fields.name ?? ''}
                            disabled={disabled}
                            onChange={(e) => setField('name', e.target.value)}
                            placeholder="property"
                        />
                        <span className="selbuilder-sep">=</span>
                        <InputGroup
                            value={state.fields.value ?? ''}
                            disabled={disabled}
                            onChange={(e) => setField('value', e.target.value)}
                            placeholder="value"
                        />
                    </div>
                );
            case 'hierarchical':
                return (
                    <div className="selbuilder-term-form">
                        <InputGroup
                            value={state.fields.chain ?? ''}
                            disabled={disabled}
                            onChange={(e) => setField('chain', e.target.value)}
                            placeholder="chain"
                        />
                        <InputGroup
                            value={state.fields.resid ?? ''}
                            disabled={disabled}
                            onChange={(e) => setField('resid', e.target.value)}
                            placeholder="resid"
                        />
                        <InputGroup
                            value={state.fields.aname ?? ''}
                            disabled={disabled}
                            onChange={(e) => setField('aname', e.target.value)}
                            placeholder="atom"
                        />
                    </div>
                );
            default:
                // nameList / numList -- single value field with autocomplete.
                return (
                    <div className="selbuilder-term-form">
                        <InputGroup
                            value={state.fields.value ?? ''}
                            disabled={disabled}
                            onChange={(e) => setField('value', e.target.value)}
                            placeholder={keywordDef.valueKind === 'numList' ? '1:10, 20' : 'value'}
                            list={suggestItems.length > 0 ? VALUE_LIST_ID : undefined}
                            fill
                        />
                        {suggestItems.length > 0 && (
                            <datalist id={VALUE_LIST_ID}>
                                {suggestItems.map((s) => (
                                    <option key={s} value={s} />
                                ))}
                            </datalist>
                        )}
                    </div>
                );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keywordDef, state.fields, suggestItems, disabled]);

    return (
        <div className={`selbuilder${disabled ? ' selbuilder--disabled' : ''}`}>
            {/* 1. Current selection -- no header row: the container's selection
                text field (with its hit-count badge) is the current selection. */}
            <div className="selbuilder-block">
                <div className="selbuilder-modify-row">
                    <span className="type-label selbuilder-field-label">Modify</span>
                    <ButtonGroup className="selbuilder-modify-btns">
                        {MODIFY_OPS.map((m) => (
                            <Button
                                key={m.op}
                                small
                                text={m.label}
                                title={m.full ?? m.label}
                                disabled={disabled || !canApplyUnary(state, m.op)}
                                onClick={() => dispatch({ type: 'APPLY_UNARY', op: m.op })}
                            />
                        ))}
                    </ButtonGroup>
                </div>
                <div className="selbuilder-distance-row">
                    <span className="type-label selbuilder-field-label" title="Distance">Dist</span>
                    <InputGroup
                        className="selbuilder-distance"
                        value={state.distance}
                        disabled={disabled}
                        onChange={(e) => dispatch({ type: 'SET_DISTANCE', value: e.target.value })}
                        placeholder="0"
                    />
                    <span className="type-caption selbuilder-unit">{'Å'}</span>
                    <Button
                        small
                        text="Around"
                        disabled={disabled || !canApplyUnary(state, 'around')}
                        onClick={() => dispatch({ type: 'APPLY_UNARY', op: 'around' })}
                    />
                    <Button
                        small
                        text="Expand"
                        disabled={disabled || !canApplyUnary(state, 'expand')}
                        onClick={() => dispatch({ type: 'APPLY_UNARY', op: 'expand' })}
                    />
                </div>
                <div className="selbuilder-current-actions">
                    <ButtonGroup>
                        <Button
                            small
                            minimal
                            icon="undo"
                            title="Step back"
                            aria-label="Step back"
                            disabled={disabled || !canUndo(state)}
                            onClick={() => dispatch({ type: 'UNDO' })}
                        />
                        <Button
                            small
                            minimal
                            icon="redo"
                            title="Step forward"
                            aria-label="Step forward"
                            disabled={disabled || !canRedo(state)}
                            onClick={() => dispatch({ type: 'REDO' })}
                        />
                        <Button
                            small
                            minimal
                            icon="eraser"
                            text="Clear"
                            disabled={disabled || state.current === ''}
                            onClick={() => dispatch({ type: 'CLEAR' })}
                        />
                    </ButtonGroup>
                    {defining ? (
                        <div className="selbuilder-saverow">
                            <InputGroup
                                value={defName}
                                onChange={(e) => setDefName(e.target.value)}
                                placeholder="name"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') onConfirmDefine();
                                    if (e.key === 'Escape') setDefining(false);
                                }}
                            />
                            <Button small intent="primary" text="Define" onClick={onConfirmDefine} />
                            <Button small minimal text="Cancel" onClick={() => setDefining(false)} />
                        </div>
                    ) : (
                        <Button
                            small
                            minimal
                            icon="tag"
                            text="Define name..."
                            title="Define as a named selection (reusable in this scene)"
                            disabled={disabled || state.current.trim() === '' || !onSaveAs}
                            onClick={() => setDefining(true)}
                        />
                    )}
                </div>
            </div>

            {/* 2. Term */}
            <div className="selbuilder-block">
                <div className="selbuilder-block-head type-eyebrow">Term</div>
                <SegmentField
                    value={state.source}
                    onValueChange={(v) => dispatch({ type: 'SET_SOURCE', source: v })}
                    options={[
                        { label: 'Prop', value: 'property' },
                        { label: 'Named', value: 'named' },
                        { label: 'History', value: 'history' },
                    ]}
                />
                {state.source === 'property' && (
                    <div className="selbuilder-property">
                        <HTMLSelect
                            className="fk-select"
                            value={state.keyword}
                            disabled={disabled}
                            title={keywordDef.full ?? keywordDef.label}
                            onChange={(e) =>
                                dispatch({
                                    type: 'SET_KEYWORD',
                                    keyword: e.target.value as typeof state.keyword,
                                })
                            }
                        >
                            {KEYWORDS.map((k) => (
                                <option key={k.key} value={k.key} title={k.full ?? k.label}>
                                    {k.label}
                                </option>
                            ))}
                        </HTMLSelect>
                        {valueInput}
                    </div>
                )}
                {(state.source === 'named' || state.source === 'history') && (
                    <Popover
                        isOpen={pickerOpen}
                        onInteraction={setPickerOpen}
                        placement="bottom-start"
                        portalClassName={portalClassName}
                        fill
                        disabled={disabled}
                        content={
                            <div className="selbuilder-term-popover">
                                {state.source === 'named' ? (
                                    <NamedSelMenu
                                        currentSel={currentSel}
                                        sceneDefs={sceneDefs}
                                        globalDefs={globalDefs}
                                        activeValue={state.picked}
                                        onPick={(v) => {
                                            dispatch({ type: 'SET_PICKED', value: v });
                                            setPickerOpen(false);
                                        }}
                                        dismissOnPick
                                    />
                                ) : (
                                    <HistoryMenu
                                        history={history}
                                        activeValue={state.picked}
                                        onPick={(v) => {
                                            dispatch({ type: 'SET_PICKED', value: v });
                                            setPickerOpen(false);
                                        }}
                                        dismissOnPick
                                    />
                                )}
                            </div>
                        }
                    >
                        <Button
                            fill
                            alignText="left"
                            rightIcon="caret-down"
                            className="selbuilder-term-trigger"
                            disabled={disabled}
                            text={
                                state.picked ||
                                (state.source === 'named' ? 'Select named...' : 'Select history...')
                            }
                        />
                    </Popover>
                )}
            </div>

            {/* 3. Apply term */}
            <div className="selbuilder-block">
                <div className="selbuilder-block-head type-eyebrow">Apply term</div>
                <div className="selbuilder-apply-row">
                    {BINARY_OPS.map((b) => (
                        <ApplyButton
                            key={b.op}
                            op={b.op}
                            label={b.label}
                            title={b.full ?? b.label}
                            icon={b.icon}
                            current={state.current}
                            term={term}
                            getHitCount={getHitCount}
                            enabled={!disabled}
                            onApply={() => dispatch({ type: 'APPLY_BINARY', op: b.op })}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

/* --- Apply button with post-apply hit count --- */

interface ApplyButtonProps {
    op: BinaryOp;
    label: string;
    /** Hover tooltip (full label when abbreviated). */
    title?: string;
    icon: IconId;
    current: string;
    term: string | null;
    getHitCount?: GetHitCount;
    enabled: boolean;
    onApply: () => void;
}

/**
 * A binary-op button showing the would-be hit count after applying it, so the
 * user does not accidentally build an empty selection. Disabled when the op
 * is not applicable (e.g. Add on an empty current selection).
 */
const ApplyButton: React.FC<ApplyButtonProps> = ({
    op,
    label,
    title,
    icon,
    current,
    term,
    getHitCount,
    enabled,
    onApply,
}) => {
    const applicable = enabled && term !== null && canApplyBinary(current, op);
    const preview = applicable ? applyBinary(current, term, op) : null;
    const count = useSelHitCount(getHitCount, preview, enabled);
    return (
        <Button
            small
            icon={icon}
            title={title ?? label}
            className="selbuilder-apply-btn"
            disabled={!applicable}
            onClick={onApply}
        >
            <span>{label}</span>
            <CountTag count={count} />
        </Button>
    );
};
