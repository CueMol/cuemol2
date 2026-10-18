import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import { failFrom, type Result } from '@renderer/worker/shared/result';
import { txnBegin, txnEnd } from '@renderer/worker/server/actions/actionLog';

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
    txnBegin(scene, label, 'gui');
    try {
        const result = fn();
        scene.commitUndoTxn();
        txnEnd(scene, true);
        return result;
    } catch (e) {
        scene.rollbackUndoTxn();
        txnEnd(scene, false);
        throw e;
    }
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
 * Both helpers tell the action log (`actions/actionLog.ts`) where the
 * transaction starts and ends, so the row it makes holds what ran inside.
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
    txnBegin(scene, label, 'gui');
    let result: Result<T>;
    try {
        result = fn();
    } catch (e) {
        scene.rollbackUndoTxn();
        txnEnd(scene, false);
        return failFrom(e);
    }
    if (result.ok) scene.commitUndoTxn();
    else scene.rollbackUndoTxn();
    txnEnd(scene, result.ok);
    return result;
}
