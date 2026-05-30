/**
 * @file components/widgets/MolSelList/selectionGrammar.ts
 * @description Grammar metadata for the Selection Builder: the set of
 * property keywords the builder can emit, how each keyword's value is
 * entered, and the built-in named macros.
 *
 * The authoritative grammar is the C++ parser/scanner
 * (`src/modules/molstr/parser_sel.yxx`, `scanner_sel.lxx`). Selection terms
 * are `keyword value` separated by WHITESPACE (not dot-separated). This
 * module hardcodes the subset surfaced by the builder; `neighbor` / `extend`
 * are intentionally omitted (unimplemented in the UI).
 *
 * @module selectionGrammar
 */

import type { SelValueKind } from './useSelectionValues';

/** Property keyword selectable in the builder's Property source. */
export type Keyword =
    | 'all'
    | 'none'
    | 'elem'
    | 'name'
    | 'resn'
    | 'resi'
    | 'chain'
    | 'alt'
    | 'bfac'
    | 'rprop'
    | 'hierarchical';

/** Shape of the value-input UI a keyword requires. */
export type ValueKind =
    | 'none' // all / none -- keyword alone confirms the term
    | 'nameList' // comma list of names (elem / name / resn / chain / alt)
    | 'numList' // comma list of numbers / ranges (resi)
    | 'compare' // comparison operator + integer (bfac)
    | 'nameValue' // name=value pair (rprop)
    | 'hierarchical'; // chain.resid.aname (3 fields)

/** A property keyword and how its value is formatted into syntax. */
export interface KeywordDef {
    /** Stable key used in builder state. */
    key: Keyword;
    /** Human-readable label shown in the keyword dropdown. */
    label: string;
    /** Emitted selection keyword (e.g. `resi` -> `resid`). */
    emit: string;
    /** Value-input UI shape. */
    valueKind: ValueKind;
    /** Single-quote plain name tokens when emitting (chain). */
    quote: boolean;
    /** Autocomplete category resolved from the active molecule, if any. */
    autocomplete?: SelValueKind;
    /** Allow the literal `null` token in the name list (altloc). */
    allowNull?: boolean;
}

/** Ordered keyword definitions; drives the Property keyword dropdown. */
export const KEYWORDS: KeywordDef[] = [
    { key: 'all', label: 'All', emit: 'all', valueKind: 'none', quote: false },
    { key: 'none', label: 'None', emit: 'none', valueKind: 'none', quote: false },
    { key: 'chain', label: 'Chain', emit: 'chain', valueKind: 'nameList', quote: true, autocomplete: 'chain' },
    { key: 'resi', label: 'Residue index', emit: 'resid', valueKind: 'numList', quote: false },
    { key: 'resn', label: 'Residue name', emit: 'resn', valueKind: 'nameList', quote: false, autocomplete: 'resname' },
    { key: 'name', label: 'Atom name', emit: 'name', valueKind: 'nameList', quote: false, autocomplete: 'aname' },
    { key: 'elem', label: 'Element', emit: 'elem', valueKind: 'nameList', quote: false, autocomplete: 'elem' },
    { key: 'alt', label: 'Altloc', emit: 'alt', valueKind: 'nameList', quote: false, allowNull: true },
    { key: 'bfac', label: 'B-factor', emit: 'bfac', valueKind: 'compare', quote: false },
    { key: 'rprop', label: 'Residue prop', emit: 'rprop', valueKind: 'nameValue', quote: false },
    { key: 'hierarchical', label: 'Hierarchical', emit: '', valueKind: 'hierarchical', quote: false },
];

/** Look up a keyword definition; falls back to the first entry. */
export function getKeywordDef(key: Keyword): KeywordDef {
    return KEYWORDS.find((k) => k.key === key) ?? KEYWORDS[0];
}
