/**
 * @file worker/server/services/undo/undo.service.ts
 * @description Undo and redo: the registry entry.
 *
 * The two calls that drive the scene`s undo stack. Everything that edits a
 * scene records itself there through `withUndoTxn` / `undoTxnResult`.
 */

import { redo } from './redo';
import { clearUndoData, getUndoState, undo } from './undo';

export const services = {
    redo,
    undo,
    getUndoState,
    clearUndoData,
};

export type * from './redo';
export type * from './undo';
