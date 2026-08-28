import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import { failFrom, type Result } from '../../shared/result';

/**
 * Run `fn` inside an undo transaction, committing on success and
 * rolling back + rethrowing on a throw.
 *
 * The throw propagates to the caller, which is responsible for
 * translating it into whatever result/error shape it returns. Most
 * scene-mutating services use this form; do NOT change its rethrow
 * behaviour -- many callsites and `editServiceTxnWrap.test.ts` depend
 * on the throw escaping.
 *
 * @param scene - Scene owning the UndoManager.
 * @param label - Undo-stack label for this edit.
 * @param fn - Mutation thunk; its return value is passed through.
 * @returns Whatever `fn` returns.
 */
export function withUndoTxn<T>(scene: Scene, label: string, fn: () => T): T {
    scene.startUndoTxn(label);
    try {
        const result = fn();
        scene.commitUndoTxn();
        return result;
    } catch (e) {
        scene.rollbackUndoTxn();
        throw e;
    }
}

/** Result shape returned by {@link tryUndoTxn}. */
export interface TryUndoTxnResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false (throw path only). */
    error?: string;
}

/**
 * Run `fn` inside an undo transaction and translate the outcome into an
 * `{ ok, error? }` result, committing ONLY on success.
 *
 * Non-rethrowing counterpart to {@link withUndoTxn}, kept until its callers
 * move to {@link undoTxnResult}.
 *
 * @param scene - Scene owning the UndoManager.
 * @param label - Undo-stack label for this edit.
 * @param fn - Mutation thunk. Return `false` to force a rollback.
 * @returns `{ ok, error? }` describing the outcome.
 */
export function tryUndoTxn(
    scene: Scene,
    label: string,
    fn: () => boolean | void,
): TryUndoTxnResult {
    scene.startUndoTxn(label);
    let result: boolean | void;
    try {
        result = fn();
    } catch (e) {
        scene.rollbackUndoTxn();
        return { ok: false, error: String(e) };
    }
    if (result === false) {
        scene.rollbackUndoTxn();
        return { ok: false };
    }
    scene.commitUndoTxn();
    return { ok: true };
}

/**
 * Run `fn` inside an undo transaction, committing only when it returns a
 * success result.
 *
 * This is the default for a service that returns {@link Result}:
 *
 *   - `fn()` returns `{ ok: true, ... }` -> `commitUndoTxn()`, result passed through.
 *   - `fn()` returns `{ ok: false }`     -> `rollbackUndoTxn()`, result passed through.
 *   - `fn()` throws                     -> `rollbackUndoTxn()` + `failFrom(e)`.
 *
 * Rolling back on a Fail return is the point. `commitUndoTxn` commits whatever
 * mutations happened, and -- because `UndoManager::commitTxn` clears the redo
 * stack even for an *empty* transaction (src/qsys/UndoManager.cpp) -- a body
 * that bailed out early without mutating used to leave the user's Redo dead.
 * Rollback touches neither stack.
 *
 * Prefer this over {@link withUndoTxn} unless the body cannot fail short of
 * throwing.
 *
 * @param scene - Scene owning the UndoManager.
 * @param label - Undo-stack label for this edit.
 * @param fn - Mutation thunk returning the service result.
 */
export function undoTxnResult<T extends object>(
    scene: Scene,
    label: string,
    fn: () => Result<T>,
): Result<T> {
    scene.startUndoTxn(label);
    let result: Result<T>;
    try {
        result = fn();
    } catch (e) {
        scene.rollbackUndoTxn();
        return failFrom(e);
    }
    if (result.ok) scene.commitUndoTxn();
    else scene.rollbackUndoTxn();
    return result;
}
