/**
 * @file components/panes/selection/selectionExpr.ts
 * @description Pure expression-building logic for the Selection Builder.
 *
 * The builder model keeps a single "current selection" expression and applies
 * unary transforms and binary set operations against a "term". All functions
 * here are pure (React-independent) and unit-tested in isolation
 * (`__test__/selectionExpr.test.ts`).
 *
 * Grammar reference: `src/modules/molstr/parser_sel.yxx` / `scanner_sel.lxx`.
 *  - around / expand are POSTFIX:   `(current) around <d>`
 *  - byres / bymainch / bysidech / not are PREFIX: `not (current)`
 *  - name list: comma-separated; tokens may be `/regex/`, `"dq"`, `'q'`, or
 *    `null`; plain tokens are single-quoted when the keyword requires it.
 *  - number list: comma-separated `N` / `N:M`; residue ids allow insertion
 *    codes (e.g. `20A`, `20A:25B`).
 *
 * Every operand is wrapped in parentheses so operator precedence can never
 * change the intended grouping.
 *
 * @module selectionExpr
 */

import type { Keyword } from './selectionGrammar';
import { getKeywordDef } from './selectionGrammar';

/** Binary set operation applied to (current, term). */
export type BinaryOp = 'set' | 'add' | 'intersect' | 'sub';

/** Unary transform applied to current. */
export type UnaryOp = 'not' | 'byres' | 'sidechain' | 'mainchain' | 'around' | 'expand';

/** Keyword-specific value-field values (see selectionGrammar.ValueKind). */
export type TermFields = Record<string, string>;

/** Wrap an expression in parentheses to isolate operator precedence. */
function paren(expr: string): string {
    return `(${expr.trim()})`;
}

/**
 * Does a name-list token carry its own quoting/regex syntax and therefore
 * pass through unquoted? Covers `/regex/`, `"dq"`, `'q'`, and the `null`
 * altloc literal.
 */
function isLiteralToken(tok: string): boolean {
    if (tok === 'null') return true;
    const c = tok[0];
    return c === '/' || c === '"' || c === "'";
}

/**
 * Normalize a comma-separated name list. Plain tokens are single-quoted when
 * `quote` is set (e.g. chain names); regex / quoted / `null` tokens pass
 * through untouched. Empty tokens are dropped.
 *
 * @returns the joined list, or `''` when no tokens remain.
 */
export function parseNameList(input: string, quote: boolean): string {
    const tokens = input
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .map((t) => (quote && !isLiteralToken(t) ? `'${t}'` : t));
    return tokens.join(',');
}

/**
 * Normalize a comma-separated number / range list. Each entry is `N`,
 * `N:M`, or carries an insertion code (`20A`, `20A:25B`). Whitespace around
 * separators is removed; tokens are otherwise passed through.
 *
 * @returns the joined list, or `''` when no tokens remain.
 */
export function parseNumList(input: string): string {
    const tokens = input
        .split(',')
        .map((t) => t.replace(/\s+/g, ''))
        .filter((t) => t.length > 0);
    return tokens.join(',');
}

/**
 * Build a selection fragment from a keyword + its value fields. Returns
 * `null` when the input is incomplete (so the UI can keep the term disabled).
 */
export function buildTerm(keyword: Keyword, fields: TermFields): string | null {
    const def = getKeywordDef(keyword);
    switch (def.valueKind) {
        case 'none':
            return def.emit;
        case 'nameList': {
            const list = parseNameList(fields.value ?? '', def.quote);
            return list === '' ? null : `${def.emit} ${list}`;
        }
        case 'numList': {
            const list = parseNumList(fields.value ?? '');
            return list === '' ? null : `${def.emit} ${list}`;
        }
        case 'compare': {
            const op = (fields.op ?? '').trim();
            const value = (fields.value ?? '').trim();
            if (op === '' || value === '') return null;
            return `${def.emit} ${op} ${value}`;
        }
        case 'nameValue': {
            const name = (fields.name ?? '').trim();
            const value = (fields.value ?? '').trim();
            if (name === '' || value === '') return null;
            return `${def.emit} ${name}=${value}`;
        }
        case 'hierarchical': {
            // Native positional dot form `chain.resid.atom` (e.g. 'A'.10.CA).
            // Unspecified positions become the `*` wildcard. Chain values are
            // single-quoted, matching selStrFromTree's convention.
            const chain = parseNameList(fields.chain ?? '', true);
            const resid = parseNumList(fields.resid ?? '');
            const aname = parseNameList(fields.aname ?? '', false);
            if (chain === '' && resid === '' && aname === '') return null;
            const c = chain === '' ? '*' : chain;
            const r = resid === '' ? '*' : resid;
            const a = aname === '' ? '*' : aname;
            return `${c}.${r}.${a}`;
        }
        default:
            return null;
    }
}

/**
 * Whether a binary op can be applied. `set` is always valid (replacement);
 * `add` / `intersect` / `sub` require a non-empty current selection (so the
 * user never accidentally builds an empty selection from nothing).
 */
export function canApplyBinary(current: string, op: BinaryOp): boolean {
    if (op === 'set') return true;
    return current.trim() !== '';
}

/** Combine current + term via a binary set operation. */
export function applyBinary(current: string, term: string, op: BinaryOp): string {
    switch (op) {
        case 'set':
            return term.trim();
        case 'add':
            return `${paren(current)} or ${paren(term)}`;
        case 'intersect':
            return `${paren(current)} and ${paren(term)}`;
        case 'sub':
            return `${paren(current)} and not ${paren(term)}`;
        default:
            return current;
    }
}

/**
 * Apply a unary transform to the current selection. `around` / `expand`
 * require a distance (Angstrom); the others ignore it.
 */
export function applyUnary(current: string, op: UnaryOp, distance?: string): string {
    const c = paren(current);
    switch (op) {
        case 'not':
            return `not ${c}`;
        case 'byres':
            return `byres ${c}`;
        case 'sidechain':
            return `bysidech ${c}`;
        case 'mainchain':
            return `bymainch ${c}`;
        case 'around':
            return `${c} around ${(distance ?? '').trim()}`;
        case 'expand':
            return `${c} expand ${(distance ?? '').trim()}`;
        default:
            return current;
    }
}
