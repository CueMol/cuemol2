/**
 * @file components/widgets/MolSelList/SelectionBuilder.tsx
 * @description Popover-based helper UI for composing CueMol selection-syntax
 * expressions without memorising the grammar. Lives as a third segment of
 * MolSelList's control group (a chevron button opening a 3-tab Popover).
 *
 * ## Design
 *
 * One-way model: the builder writes into the selection text but never parses
 * it back. Power users hand-edit the text freely; novices get a guided path.
 * Three tabs:
 *  - Builder: pick a property keyword + value, combine terms with AND/OR/NOT.
 *  - Macros: apply a named selection (protein, water, ...); hover discloses
 *    its real definition (read-only) so users learn the raw grammar.
 *  - History: re-apply a recently committed expression.
 *
 * ## Grammar (verified against src/modules/molstr/parser_sel.yxx and the
 * tritium generator molStruct/selStrFromTree.ts)
 *
 * CueMol selection terms are `keyword value` separated by WHITESPACE -- NOT
 * dot-separated. Keywords: `chain`, `resi`/`resid` (rangeable with `:`),
 * `resn` (residue name), `name` (atom name), `elem`. Chain values are
 * single-quoted (matching selStrFromTree's `c;'A'` convention). Boolean
 * operators are `and` / `or` / `not` with parentheses. Named macros
 * (`protein`, `water`, ...) are emitted by name and resolved by the C++
 * compiler at runtime; their definitions live in data/default_style.xml.
 *
 * @remarks
 *  - The builder never writes selection history. History is recorded only
 *    when the committed text is applied by the parent (e.g. PaintSelCell
 *    blur, SelectionPane Select).
 *  - Emitted fragments are validated live by MolSelList's existing
 *    `validateSelection` round-trip, so a malformed fragment surfaces as a
 *    danger intent on the input.
 *
 * @module SelectionBuilder
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    Button,
    Popover,
    Tabs,
    Tab,
    HTMLSelect,
    InputGroup,
    Tag,
    Menu,
    MenuItem,
    MenuDivider,
} from '@blueprintjs/core';
import { useTheme } from '../../../contexts/ThemeContext';
import type { SelValueKind, ResolveValues } from './useSelectionValues';

/* --- Grammar metadata --- */

/** A selectable property and how its value is formatted into syntax. */
interface PropertyDef {
    /** Emitted selection keyword, e.g. "chain", "resn", "name". */
    key: string;
    /** Human-readable label shown in the dropdown. */
    label: string;
    /** Whether the value supports a numeric range (`a:b`). */
    rangeable: boolean;
    /** Single-quote the value when emitting (matches selStrFromTree). */
    quote: boolean;
    /**
     * Autocomplete category resolved from the active molecule. Note this is
     * the value-source kind, which differs from the emitted keyword
     * (kind "resname" -> keyword "resn", kind "aname" -> keyword "name").
     */
    valueKind?: SelValueKind;
}

const PROPERTIES: PropertyDef[] = [
    { key: 'chain', label: 'Chain', rangeable: false, quote: true, valueKind: 'chain' },
    { key: 'resi', label: 'Residue index', rangeable: true, quote: false },
    { key: 'resn', label: 'Residue name', rangeable: false, quote: false, valueKind: 'resname' },
    { key: 'name', label: 'Atom name', rangeable: false, quote: false, valueKind: 'aname' },
    { key: 'elem', label: 'Element', rangeable: false, quote: false, valueKind: 'elem' },
];

/**
 * Named macros. The macro name is emitted and resolved by the C++ compiler
 * at runtime (definitions live in data/default_style.xml, e.g.
 * water = `rprop type=water`).
 */
interface MacroDef {
    key: string;
    label: string;
}

const MACROS: MacroDef[] = [
    { key: 'protein', label: 'Protein' },
    { key: 'nucleic', label: 'Nucleic acid' },
    { key: 'ligand', label: 'Ligand' },
    { key: 'water', label: 'Water' },
    { key: 'sugar', label: 'Sugar' },
    { key: 'hydrogen', label: 'Hydrogen' },
    { key: 'helix', label: 'Helix' },
    { key: 'sheet', label: 'Sheet' },
    { key: 'coil', label: 'Coil' },
];

type BoolOp = 'and' | 'or';

/** A single builder term plus the operator that joins it to the next term. */
interface Term {
    id: string;
    /** Rendered selection fragment, e.g. "chain 'A'" or "resi 1:10". */
    text: string;
    /** Negation applied to this term. */
    negate: boolean;
    /** Operator joining THIS term to the following one (ignored on last). */
    joiner: BoolOp;
}

/* --- Helpers --- */

/** Build a selection fragment from a property + value(s). */
function makeFragment(prop: PropertyDef, value: string, rangeTo: string): string {
    const v = value.trim();
    if (prop.rangeable && rangeTo.trim() !== '') {
        return `${prop.key} ${v}:${rangeTo.trim()}`;
    }
    const rendered = prop.quote ? `'${v}'` : v;
    return `${prop.key} ${rendered}`;
}

/** Join all terms into a single selection expression. */
function composeExpression(terms: Term[]): string {
    return terms
        .map((t, i) => {
            const frag = t.negate ? `not (${t.text})` : t.text;
            const joiner = i < terms.length - 1 ? ` ${t.joiner} ` : '';
            return frag + joiner;
        })
        .join('');
}

/** datalist id for the value field's native autocomplete. */
const VALUE_LIST_ID = 'selbuilder-value-list';

/* --- Component --- */

export interface SelectionBuilderProps {
    /** Current committed selection text (read-only here). */
    value: string;
    /** Emit a new expression to the parent. */
    onEmit: (next: string, mode: 'insert' | 'replace') => void;
    /** Recently used expressions, newest first. */
    history?: string[];
    /** Molecule's current selection string, shown as a preset (if any). */
    currentSel?: string;
    /** Scene-level named selection defs (StyleManager). */
    sceneDefs?: string[];
    /** Global named selection defs (StyleManager). */
    globalDefs?: string[];
    /**
     * Resolve candidate values for a keyword from the active molecule.
     * Returns [] when unavailable; the field then accepts free text.
     */
    resolveValues?: ResolveValues;
    /** Refresh history just before the popover opens. */
    onOpening?: () => void;
    disabled?: boolean;
}

export const SelectionBuilder: React.FC<SelectionBuilderProps> = ({
    value,
    onEmit,
    history = [],
    currentSel,
    sceneDefs = [],
    globalDefs = [],
    resolveValues,
    onOpening,
    disabled,
}) => {
    void value;
    const { theme } = useTheme();
    const portalClassName = theme === 'dark' ? 'bp5-dark' : '';

    const [isOpen, setIsOpen] = useState(false);

    // Builder draft state -- local until emitted.
    const [terms, setTerms] = useState<Term[]>([]);
    const [propKey, setPropKey] = useState(PROPERTIES[0].key);
    const [val, setVal] = useState('');
    const [rangeTo, setRangeTo] = useState('');
    // Monotonic counter for term ids (avoids Date.now duplicate-key risk).
    const [seq, setSeq] = useState(0);

    const activeProp = useMemo(
        () => PROPERTIES.find((p) => p.key === propKey) ?? PROPERTIES[0],
        [propKey],
    );

    // Autocomplete values for the active keyword, loaded async on open /
    // keyword change. Empty array -> free-text input fallback.
    const [suggestItems, setSuggestItems] = useState<string[]>([]);
    useEffect(() => {
        if (!isOpen || !activeProp.valueKind || !resolveValues) {
            setSuggestItems([]);
            return;
        }
        let cancelled = false;
        resolveValues(activeProp.valueKind)
            .then((vals) => {
                if (!cancelled) setSuggestItems(vals);
            })
            .catch(() => {
                if (!cancelled) setSuggestItems([]);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, activeProp, resolveValues]);

    /* -- Term manipulation -- */

    const addTerm = useCallback(() => {
        if (val.trim() === '') return;
        const text = makeFragment(activeProp, val, rangeTo);
        setTerms((prev) => [
            ...prev,
            { id: `t-${seq}`, text, negate: false, joiner: 'and' },
        ]);
        setSeq((s) => s + 1);
        setVal('');
        setRangeTo('');
    }, [activeProp, val, rangeTo, seq]);

    const removeTerm = useCallback((id: string) => {
        setTerms((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toggleNegate = useCallback((id: string) => {
        setTerms((prev) => prev.map((t) => (t.id === id ? { ...t, negate: !t.negate } : t)));
    }, []);

    const setJoiner = useCallback((id: string, joiner: BoolOp) => {
        setTerms((prev) => prev.map((t) => (t.id === id ? { ...t, joiner } : t)));
    }, []);

    /* -- Emit -- */

    const preview = useMemo(() => composeExpression(terms), [terms]);

    const emit = useCallback(
        (mode: 'insert' | 'replace') => {
            if (preview === '') return;
            onEmit(preview, mode);
            setIsOpen(false);
            setTerms([]);
        },
        [preview, onEmit],
    );

    // Apply a ready-made expression (preset / macro / named def / history).
    const emitReplace = useCallback(
        (expr: string) => {
            onEmit(expr, 'replace');
            setIsOpen(false);
        },
        [onEmit],
    );

    /* -- Tab panels -- */

    const builderPanel = (
        <div className="selbuilder-panel">
            <div className="selbuilder-form">
                {/* Keyword picker. */}
                <HTMLSelect
                    value={propKey}
                    onChange={(e) => setPropKey(e.target.value)}
                    options={PROPERTIES.map((p) => ({ value: p.key, label: p.label }))}
                />
                {/* Value field. When the active molecule yields real values
                    they feed a native datalist for type-ahead autocomplete;
                    otherwise it is a plain free-text field. */}
                <InputGroup
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder="value"
                    list={suggestItems.length > 0 ? VALUE_LIST_ID : undefined}
                />
                {suggestItems.length > 0 && (
                    <datalist id={VALUE_LIST_ID}>
                        {suggestItems.map((s) => (
                            <option key={s} value={s} />
                        ))}
                    </datalist>
                )}
                {activeProp.rangeable && (
                    <>
                        <span className="selbuilder-range-sep">:</span>
                        <InputGroup
                            value={rangeTo}
                            onChange={(e) => setRangeTo(e.target.value)}
                            placeholder="to (optional)"
                        />
                    </>
                )}
                <Button icon="plus" intent="primary" onClick={addTerm} text="Add" />
            </div>

            {/* Current terms as removable tags with per-term joiner / negate. */}
            <div className="selbuilder-terms">
                {terms.length === 0 && <span className="selbuilder-empty">No terms yet.</span>}
                {terms.map((t, i) => (
                    <div key={t.id} className="selbuilder-term-row">
                        <Tag
                            minimal
                            interactive
                            intent={t.negate ? 'danger' : 'none'}
                            onClick={() => toggleNegate(t.id)}
                            onRemove={() => removeTerm(t.id)}
                            title="Click to toggle NOT"
                        >
                            {t.negate ? 'not ' : ''}
                            {t.text}
                        </Tag>
                        {i < terms.length - 1 && (
                            <HTMLSelect
                                value={t.joiner}
                                onChange={(e) => setJoiner(t.id, e.target.value as BoolOp)}
                                options={[
                                    { value: 'and', label: 'AND' },
                                    { value: 'or', label: 'OR' },
                                ]}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Live preview of the composed expression. */}
            <div className="selbuilder-preview">
                <code>{preview || '\u2014'}</code>
            </div>

            <div className="selbuilder-actions">
                <Button text="Replace all" onClick={() => emit('replace')} />
                <Button text="Insert" intent="primary" onClick={() => emit('insert')} />
            </div>
        </div>
    );

    // Library tab: presets + built-in macros + scene / global named defs.
    // Replaces the former OS-native HTMLSelect picker; clicking any entry
    // applies it (replace).
    const libraryPanel = (
        <Menu className="selbuilder-menu">
            <MenuDivider title="Presets" />
            {currentSel !== undefined && (
                <MenuItem text={`current (${currentSel})`} onClick={() => emitReplace(currentSel)} />
            )}
            <MenuItem text="all (*)" onClick={() => emitReplace('*')} />
            <MenuItem text="none" onClick={() => emitReplace('')} />

            <MenuDivider title="Macros" />
            {MACROS.map((m) => (
                <MenuItem key={m.key} text={m.label} onClick={() => emitReplace(m.key)} />
            ))}

            {sceneDefs.length > 0 && (
                <>
                    <MenuDivider title="Scene" />
                    {sceneDefs.map((v) => (
                        <MenuItem key={`s-${v}`} text={v} onClick={() => emitReplace(v)} />
                    ))}
                </>
            )}
            {globalDefs.length > 0 && (
                <>
                    <MenuDivider title="Global" />
                    {globalDefs.map((v) => (
                        <MenuItem key={`g-${v}`} text={v} onClick={() => emitReplace(v)} />
                    ))}
                </>
            )}
        </Menu>
    );

    const historyPanel = (
        <Menu className="selbuilder-menu">
            {history.length === 0 ? (
                <MenuItem disabled text="No history" />
            ) : (
                history.map((h, i) => (
                    <MenuItem key={i} text={h} onClick={() => emitReplace(h)} />
                ))
            )}
        </Menu>
    );

    return (
        <Popover
            isOpen={isOpen}
            onInteraction={(next) => {
                if (next && !isOpen) onOpening?.();
                setIsOpen(next);
            }}
            placement="bottom-end"
            portalClassName={portalClassName}
            className="selbuilder-trigger"
            disabled={disabled}
            content={
                <div className="selbuilder-popover">
                    <Tabs id="selbuilder-tabs" defaultSelectedTabId="builder">
                        <Tab id="builder" title="Builder" panel={builderPanel} />
                        <Tab id="library" title="Library" panel={libraryPanel} />
                        <Tab id="history" title="History" panel={historyPanel} />
                    </Tabs>
                </div>
            }
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
