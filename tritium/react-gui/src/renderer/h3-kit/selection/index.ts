/**
 * @file h3-kit/selection/index.ts
 * @description Shared selection-builder core: the controlled `SelectionBuilder`
 * widget (Term + Modify composer) plus its pure expression algebra, grammar,
 * operand-draft reducer, and autocomplete-value resolver. Reused by both the
 * SelectionPane (components) and the MolSelList picker popover (h3-kit) without
 * a layering inversion.
 *
 * @module selection
 */

export { SelectionBuilder } from './SelectionBuilder';
export type { SelectionBuilderProps } from './SelectionBuilder';
export {
    builderReducer,
    initBuilderState,
    selectTerm,
    canApplyUnary,
    DEFAULT_DISTANCE,
} from './selBuilderReducer';
export type { BuilderState, BuilderAction } from './selBuilderReducer';
export { useSelectionValues } from './useSelectionValues';
export type { ResolveValues, SelValueKind } from './useSelectionValues';
export { KEYWORDS, getKeywordDef } from './selectionGrammar';
export type { Keyword, KeywordDef, ValueKind } from './selectionGrammar';
export {
    parseNameList,
    parseNumList,
    buildTerm,
    canApplyBinary,
    applyBinary,
    applyUnary,
} from './selectionExpr';
export type { BinaryOp, UnaryOp, TermFields } from './selectionExpr';
