/**
 * @file components/widgets/MolSelList/SelectionBuilder.tsx
 * @description Popover UI for composing CueMol selection-syntax expressions
 * without memorising the grammar.
 *
 * ## Model
 *
 * A single "current selection" expression is the target of every operation.
 * A "term" (from one of three sources) is combined into it via binary set
 * operations (Set / Add / Intersect / Sub); the current selection itself is
 * reshaped by unary transforms (Not / Byres / Sidechain / Mainchain /
 * Around / Expand). "Save as..." names the current selection so it can be
 * reused as a parenthesised sub-expression. Logical operators are never typed
 * by the user -- they are produced by these buttons.
 *
 * One-way: the builder is a controlled component. The container seeds the
 * initial current selection via `value` (which need not be `mol.sel`) when the
 * popover opens, and the current expression is mirrored back into the parent's
 * text box in real time via `onEmit` (no explicit Apply button). The builder
 * never mutates `mol.sel` or touches the undo history; history / selection
 * commits stay the container's job (e.g. SelectionPane's Select button). Hit
 * counts are read-only probes.
 *
 * Grammar reference: `src/modules/molstr/parser_sel.yxx` / `scanner_sel.lxx`
 * (see selectionExpr.ts / selectionGrammar.ts).
 *
 * @module SelectionBuilder
 */

import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Button, ButtonGroup, HTMLSelect, InputGroup, Menu, MenuDivider, MenuItem, Popover, SegmentedControl, Tag } from '@blueprintjs/core';
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
    type TermSource,
} from './selBuilderReducer';
import { useSelHitCount, type GetHitCount, type HitCount } from './useSelHitCount';

/* --- Props --- */

export interface SelectionBuilderProps {
    /** Seed expression for the current selection (container-provided). */
    value: string;
    /** Emit the confirmed expression to the parent (writes its text box). */
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
    /** Persist the current selection under a name ("Save as..."). */
    onSaveAs?: (name: string, expr: string) => Promise<boolean> | void;
    /** Refresh history just before the popover opens. */
    onOpening?: () => void;
    disabled?: boolean;
}

/* --- Hit-count badge --- */

const VALUE_LIST_ID = 'selbuilder-value-list';

/** Render a hit-count as a Tag, warning (red) when the selection is empty. */
const CountTag: React.FC<{ count: HitCount }> = ({ count }) => {
    if (count === undefined) return null;
    if (count === 'loading') return <Tag minimal round className="selbuilder-count">...</Tag>;
    if (count === null) return null;
    return (
        <Tag minimal round intent={count === 0 ? 'warning' : 'none'} className="selbuilder-count">
            {count}
        </Tag>
    );
};

/* --- Component --- */

/** Blueprint icon identifier (or element), as accepted by Button's `icon`. */
type IconId = React.ComponentProps<typeof Button>['icon'];

// Set-operation icons: import = load/overwrite the current with the term,
// plus/minus = union/difference, intersection = the overlap.
const BINARY_OPS: { op: BinaryOp; label: string; icon: IconId }[] = [
    { op: 'set', label: 'Set', icon: 'import' },
    { op: 'add', label: 'Add', icon: 'plus' },
    { op: 'intersect', label: 'Intsec', icon: 'intersection' },
    { op: 'sub', label: 'Sub', icon: 'minus' },
];

const MODIFY_OPS: { op: UnaryOp; label: string }[] = [
    { op: 'not', label: 'Not' },
    { op: 'byres', label: 'Byres' },
    { op: 'sidechain', label: 'Sidechain' },
    { op: 'mainchain', label: 'Mainchain' },
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
    onOpening,
    disabled,
}) => {
    const { theme } = useTheme();
    const portalClassName = theme === 'dark' ? 'bp5-dark' : '';

    const [isOpen, setIsOpen] = useState(false);
    const [state, dispatch] = useReducer(builderReducer, value, initBuilderState);

    // Re-seed the current selection from the container each time the popover
    // opens, so it reflects the latest text-box value.
    const handleInteraction = useCallback(
        (next: boolean) => {
            if (next && !isOpen) {
                onOpening?.();
                dispatch({ type: 'SET_CURRENT', value });
            }
            setIsOpen(next);
        },
        [isOpen, value, onOpening],
    );

    const keywordDef = getKeywordDef(state.keyword);
    const term = selectTerm(state);

    // --- Autocomplete values for the active Property keyword ---
    const [suggestItems, setSuggestItems] = useState<string[]>([]);
    useEffect(() => {
        const kind = keywordDef.autocomplete;
        if (!isOpen || state.source !== 'property' || !kind || !resolveValues) {
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
    }, [isOpen, state.source, keywordDef.autocomplete, resolveValues]);

    // --- Hit counts (read-only probes) ---
    const currentCount = useSelHitCount(getHitCount, state.current, isOpen);
    const termCount = useSelHitCount(getHitCount, term, isOpen);

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

    // --- Real-time sync to the parent ---
    // While open, mirror the current selection into the parent's text box on
    // every change (and on dismiss, since the last value is already synced).
    // There is no explicit Apply button; the builder is a live editor of the
    // text value. The parent re-seeds `current` only on open, so this never
    // loops.
    useEffect(() => {
        if (!isOpen) return;
        onEmit(state.current);
    }, [isOpen, state.current, onEmit]);

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
                            value={state.fields.op ?? '<'}
                            onChange={(e) => setField('op', e.target.value)}
                            options={[
                                { value: '<', label: '<' },
                                { value: '>', label: '>' },
                                { value: '=', label: '=' },
                            ]}
                        />
                        <InputGroup
                            value={state.fields.value ?? ''}
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
                            onChange={(e) => setField('name', e.target.value)}
                            placeholder="property"
                        />
                        <span className="selbuilder-sep">=</span>
                        <InputGroup
                            value={state.fields.value ?? ''}
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
                            onChange={(e) => setField('chain', e.target.value)}
                            placeholder="chain"
                        />
                        <InputGroup
                            value={state.fields.resid ?? ''}
                            onChange={(e) => setField('resid', e.target.value)}
                            placeholder="resid"
                        />
                        <InputGroup
                            value={state.fields.aname ?? ''}
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
    }, [keywordDef, state.fields, suggestItems]);

    /* -- Named source menu (Selected / Scene / Global) --
       Built-in macros (protein, water, ...) are global named selections
       loaded from data/default_style.xml into scope 0, so they already
       surface under "Global" -- no separate hardcoded list. */
    const hasNamed = currentSel !== undefined || sceneDefs.length > 0 || globalDefs.length > 0;
    const namedMenu = (
        <Menu className="selbuilder-menu">
            {!hasNamed && <MenuItem disabled text="No named selections" />}
            {currentSel !== undefined && (
                <>
                    <MenuDivider title="Selected" />
                    <MenuItem
                        text={currentSel}
                        active={state.picked === currentSel}
                        shouldDismissPopover={false}
                        onClick={() => dispatch({ type: 'SET_PICKED', value: currentSel })}
                    />
                </>
            )}
            {sceneDefs.length > 0 && (
                <>
                    <MenuDivider title="Scene" />
                    {sceneDefs.map((v) => (
                        <MenuItem
                            key={`s-${v}`}
                            text={v}
                            active={state.picked === v}
                            shouldDismissPopover={false}
                            onClick={() => dispatch({ type: 'SET_PICKED', value: v })}
                        />
                    ))}
                </>
            )}
            {globalDefs.length > 0 && (
                <>
                    <MenuDivider title="Global" />
                    {globalDefs.map((v) => (
                        <MenuItem
                            key={`g-${v}`}
                            text={v}
                            active={state.picked === v}
                            shouldDismissPopover={false}
                            onClick={() => dispatch({ type: 'SET_PICKED', value: v })}
                        />
                    ))}
                </>
            )}
        </Menu>
    );

    /* -- History source menu -- */
    const historyMenu = (
        <Menu className="selbuilder-menu">
            {history.length === 0 ? (
                <MenuItem disabled text="No history" />
            ) : (
                history.map((h, i) => (
                    <MenuItem
                        key={i}
                        text={h}
                        active={state.picked === h}
                        shouldDismissPopover={false}
                        onClick={() => dispatch({ type: 'SET_PICKED', value: h })}
                    />
                ))
            )}
        </Menu>
    );

    const content = (
        <div className="selbuilder-popover">
            {/* 1. Current selection */}
            <div className="selbuilder-block">
                <div className="selbuilder-block-head type-eyebrow">Current selection</div>
                <div className="selbuilder-current">
                    <code>{state.current || '—'}</code>
                    <CountTag count={currentCount} />
                </div>
                <div className="selbuilder-modify-row">
                    <span className="type-label selbuilder-field-label">Modify</span>
                    <ButtonGroup>
                        {MODIFY_OPS.map((m) => (
                            <Button
                                key={m.op}
                                small
                                text={m.label}
                                disabled={!canApplyUnary(state, m.op)}
                                onClick={() => dispatch({ type: 'APPLY_UNARY', op: m.op })}
                            />
                        ))}
                    </ButtonGroup>
                </div>
                <div className="selbuilder-distance-row">
                    <span className="type-label selbuilder-field-label">Distance</span>
                    <InputGroup
                        className="selbuilder-distance"
                        value={state.distance}
                        onChange={(e) => dispatch({ type: 'SET_DISTANCE', value: e.target.value })}
                        placeholder="0"
                    />
                    <span className="type-caption selbuilder-unit">{'Å'}</span>
                    <Button
                        small
                        text="Around"
                        disabled={!canApplyUnary(state, 'around')}
                        onClick={() => dispatch({ type: 'APPLY_UNARY', op: 'around' })}
                    />
                    <Button
                        small
                        text="Expand"
                        disabled={!canApplyUnary(state, 'expand')}
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
                            disabled={!canUndo(state)}
                            onClick={() => dispatch({ type: 'UNDO' })}
                        />
                        <Button
                            small
                            minimal
                            icon="redo"
                            title="Step forward"
                            aria-label="Step forward"
                            disabled={!canRedo(state)}
                            onClick={() => dispatch({ type: 'REDO' })}
                        />
                        <Button
                            small
                            minimal
                            icon="eraser"
                            text="Clear"
                            disabled={state.current === ''}
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
                            disabled={state.current.trim() === '' || !onSaveAs}
                            onClick={() => setDefining(true)}
                        />
                    )}
                </div>
            </div>

            {/* 2. Term */}
            <div className="selbuilder-block">
                <div className="selbuilder-block-head type-eyebrow">Term</div>
                <SegmentedControl
                    small
                    fill
                    value={state.source}
                    onValueChange={(v) => dispatch({ type: 'SET_SOURCE', source: v as TermSource })}
                    options={[
                        { label: 'Property', value: 'property' },
                        { label: 'Named', value: 'named' },
                        { label: 'History', value: 'history' },
                    ]}
                />
                {state.source === 'property' && (
                    <div className="selbuilder-property">
                        <HTMLSelect
                            value={state.keyword}
                            onChange={(e) =>
                                dispatch({
                                    type: 'SET_KEYWORD',
                                    keyword: e.target.value as typeof state.keyword,
                                })
                            }
                            options={KEYWORDS.map((k) => ({ value: k.key, label: k.label }))}
                        />
                        {valueInput}
                    </div>
                )}
                {state.source === 'named' && namedMenu}
                {state.source === 'history' && historyMenu}
                <div className="selbuilder-term-preview">
                    <code>{term ?? '—'}</code>
                    <CountTag count={termCount} />
                </div>
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
                            icon={b.icon}
                            current={state.current}
                            term={term}
                            getHitCount={getHitCount}
                            enabled={isOpen}
                            onApply={() => dispatch({ type: 'APPLY_BINARY', op: b.op })}
                        />
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <Popover
            isOpen={isOpen}
            onInteraction={handleInteraction}
            placement="bottom-end"
            portalClassName={portalClassName}
            className="selbuilder-trigger"
            disabled={disabled}
            content={content}
        >
            <Button
                icon="caret-down"
                minimal
                disabled={disabled}
                title="Build selection"
                aria-label="Build selection"
            />
        </Popover>
    );
};

/* --- Apply button with post-apply hit count --- */

interface ApplyButtonProps {
    op: BinaryOp;
    label: string;
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
    icon,
    current,
    term,
    getHitCount,
    enabled,
    onApply,
}) => {
    const applicable = term !== null && canApplyBinary(current, op);
    const preview = applicable ? applyBinary(current, term, op) : null;
    const count = useSelHitCount(getHitCount, preview, enabled);
    return (
        <Button
            small
            icon={icon}
            className="selbuilder-apply-btn"
            disabled={!applicable}
            onClick={onApply}
        >
            <span>{label}</span>
            <CountTag count={count} />
        </Button>
    );
};
