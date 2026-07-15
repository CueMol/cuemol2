/**
 * @file components/panes/selection/selBuilderReducer.ts
 * @description Operand-draft state model for the Selection Builder.
 *
 * Holds only the in-progress "term" draft: which of three sources is active
 * (Property keyword + value fields, or a picked Named / History expression)
 * plus the shared Around/Expand distance. The "current selection" is NOT owned
 * here -- it is the target molecule's `mol.sel` (single source of truth), held
 * by the container and passed in as `current` where an operation needs it.
 * Expression composition is delegated to the pure functions in
 * `selectionExpr.ts`; the reducer itself is pure and unit-tested.
 *
 * There is no builder-local undo/redo: since every operation writes `mol.sel`
 * live, stepping back is the scene's undo (Cmd+Z), not a second stack.
 *
 * @module selBuilderReducer
 */

import type { Keyword } from './selectionGrammar';
import { getKeywordDef } from './selectionGrammar';
import type { UnaryOp, TermFields } from './selectionExpr';
import { buildTerm } from './selectionExpr';

/** Which source supplies the term applied to the current selection. */
export type TermSource = 'property' | 'named' | 'history';

export interface BuilderState {
    /** Active term source. */
    source: TermSource;
    /** Property source: selected keyword. */
    keyword: Keyword;
    /** Property source: keyword-specific value-field values. */
    fields: TermFields;
    /** Named / History source: the picked ready-made expression. */
    picked: string;
    /** Shared Around/Expand distance (Angstrom). */
    distance: string;
}

export type BuilderAction =
    | { type: 'SET_SOURCE'; source: TermSource }
    | { type: 'SET_KEYWORD'; keyword: Keyword }
    | { type: 'SET_FIELD'; name: string; value: string }
    | { type: 'SET_PICKED'; value: string }
    | { type: 'SET_DISTANCE'; value: string }
    | { type: 'RESET_DRAFT' }
    | { type: 'INIT' };

/**
 * Default Around/Expand radius (Angstrom). Pre-filled so the buttons are
 * enabled from the start -- an empty field that grays them out hides how to
 * use them. 5 A is a common contact-shell radius.
 */
export const DEFAULT_DISTANCE = '5';

/** Default value-field values for a keyword (e.g. bfac's comparison op). */
function defaultFields(keyword: Keyword): TermFields {
    return getKeywordDef(keyword).valueKind === 'compare' ? { op: '<', value: '' } : {};
}

/** Build the initial operand-draft state. */
export function initBuilderState(): BuilderState {
    return {
        source: 'property',
        keyword: 'hierarchical',
        fields: defaultFields('hierarchical'),
        picked: '',
        distance: DEFAULT_DISTANCE,
    };
}

/**
 * The term currently described by the draft, or `null` when incomplete.
 * Property source derives it from keyword + fields; Named / History use the
 * picked expression.
 */
export function selectTerm(state: BuilderState): string | null {
    if (state.source === 'property') {
        return buildTerm(state.keyword, state.fields);
    }
    const picked = state.picked.trim();
    return picked === '' ? null : picked;
}

/** Whether the shared distance field holds a valid non-negative number. */
function hasValidDistance(distance: string): boolean {
    const t = distance.trim();
    if (t === '') return false;
    const d = Number(t);
    return Number.isFinite(d) && d >= 0;
}

/**
 * Whether a unary op is currently applicable against `current` (the applied
 * selection). Around/Expand additionally require a valid distance.
 */
export function canApplyUnary(state: BuilderState, op: UnaryOp, current: string): boolean {
    if (current.trim() === '') return false;
    if (op === 'around' || op === 'expand') return hasValidDistance(state.distance);
    return true;
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
    switch (action.type) {
        case 'SET_SOURCE':
            return { ...state, source: action.source };
        case 'SET_KEYWORD':
            return { ...state, keyword: action.keyword, fields: defaultFields(action.keyword) };
        case 'SET_FIELD':
            return { ...state, fields: { ...state.fields, [action.name]: action.value } };
        case 'SET_PICKED':
            return { ...state, picked: action.value };
        case 'SET_DISTANCE':
            return { ...state, distance: action.value };
        case 'RESET_DRAFT':
            return { ...state, fields: defaultFields(state.keyword), picked: '' };
        case 'INIT':
            return initBuilderState();
        default:
            return state;
    }
}
