/**
 * @file components/widgets/MolSelList/selBuilderReducer.ts
 * @description Local state model for the Selection Builder.
 *
 * Holds the in-progress "current selection" expression plus the term draft
 * (which of three sources is active, the Property keyword + value fields, and
 * the picked Named/History expression) and the shared Around/Expand distance.
 * All expression composition is delegated to the pure functions in
 * `selectionExpr.ts`; the reducer itself is pure and unit-tested.
 *
 * @module selBuilderReducer
 */

import type { Keyword } from './selectionGrammar';
import { getKeywordDef } from './selectionGrammar';
import type { BinaryOp, UnaryOp, TermFields } from './selectionExpr';
import { applyBinary, applyUnary, buildTerm, canApplyBinary } from './selectionExpr';

/** Which source supplies the term applied to the current selection. */
export type TermSource = 'property' | 'named' | 'history';

export interface BuilderState {
    /** The expression under construction (target of every operation). */
    current: string;
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
    /**
     * Builder-local undo stack of previous `current` values. Independent of
     * the C++ scene undo txn -- it lets the user step back a mis-applied
     * operation (e.g. Mainchain instead of Sidechain) without clearing.
     */
    past: string[];
    /** Builder-local redo stack (values undone from `current`). */
    future: string[];
}

export type BuilderAction =
    | { type: 'SET_CURRENT'; value: string }
    | { type: 'SET_SOURCE'; source: TermSource }
    | { type: 'SET_KEYWORD'; keyword: Keyword }
    | { type: 'SET_FIELD'; name: string; value: string }
    | { type: 'SET_PICKED'; value: string }
    | { type: 'SET_DISTANCE'; value: string }
    | { type: 'APPLY_BINARY'; op: BinaryOp }
    | { type: 'APPLY_UNARY'; op: UnaryOp }
    | { type: 'CLEAR' }
    | { type: 'UNDO' }
    | { type: 'REDO' }
    | { type: 'RESET_DRAFT' };

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

/** Build the initial builder state seeded with a current expression. */
export function initBuilderState(current: string): BuilderState {
    return {
        current,
        source: 'property',
        keyword: 'hierarchical',
        fields: defaultFields('hierarchical'),
        picked: '',
        distance: DEFAULT_DISTANCE,
        past: [],
        future: [],
    };
}

/** Commit a new `current`, pushing the old onto the undo stack. */
function commitCurrent(state: BuilderState, next: string): BuilderState {
    return { ...state, current: next, past: [...state.past, state.current], future: [] };
}

/** Whether a builder-local undo / redo step is available. */
export function canUndo(state: BuilderState): boolean {
    return state.past.length > 0;
}
export function canRedo(state: BuilderState): boolean {
    return state.future.length > 0;
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

/** Whether a unary op is currently applicable (distance gate for around/expand). */
export function canApplyUnary(state: BuilderState, op: UnaryOp): boolean {
    if (state.current.trim() === '') return false;
    if (op === 'around' || op === 'expand') return hasValidDistance(state.distance);
    return true;
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
    switch (action.type) {
        case 'SET_CURRENT':
            // Re-seeding from the container starts a fresh builder session;
            // the local undo history resets.
            return { ...state, current: action.value, past: [], future: [] };
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
        case 'APPLY_BINARY': {
            const term = selectTerm(state);
            if (term === null || !canApplyBinary(state.current, action.op)) return state;
            return commitCurrent(state, applyBinary(state.current, term, action.op));
        }
        case 'APPLY_UNARY': {
            if (!canApplyUnary(state, action.op)) return state;
            return commitCurrent(state, applyUnary(state.current, action.op, state.distance));
        }
        case 'CLEAR':
            return state.current === '' ? state : commitCurrent(state, '');
        case 'UNDO': {
            if (state.past.length === 0) return state;
            const prev = state.past[state.past.length - 1];
            return {
                ...state,
                current: prev,
                past: state.past.slice(0, -1),
                future: [state.current, ...state.future],
            };
        }
        case 'REDO': {
            if (state.future.length === 0) return state;
            const next = state.future[0];
            return {
                ...state,
                current: next,
                past: [...state.past, state.current],
                future: state.future.slice(1),
            };
        }
        case 'RESET_DRAFT':
            return { ...state, fields: defaultFields(state.keyword), picked: '' };
        default:
            return state;
    }
}
