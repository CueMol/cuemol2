import type { Scene } from '@cuemol/core/src/wrappers/Scene';

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
 * This is the non-rethrowing counterpart to {@link withUndoTxn}. It exists
 * so that a failed or partial mutation never reaches `commitUndoTxn()` (which
 * would leave a bogus undo entry on the stack) while the dialogs still get the
 * `{ ok:false }` UX they expect instead of a thrown exception:
 *
 *   - `fn()` throws         -> `rollbackUndoTxn()` + `{ ok:false, error:String(e) }`
 *                              (NOT rethrown -- unlike `withUndoTxn`).
 *   - `fn()` returns `false` -> `rollbackUndoTxn()` + `{ ok:false }`. Use a
 *                              boolean return only when the C++ mutation has a
 *                              meaningful success flag; a `false` means the
 *                              edit did not take effect and must be rolled back.
 *   - `fn()` returns `void` / `true` / `undefined` -> `commitUndoTxn()` + `{ ok:true }`.
 *
 * @param scene - Scene owning the UndoManager.
 * @param label - Undo-stack label for this edit.
 * @param fn - Mutation thunk. Return `false` to force a rollback; return
 *   `void`/`true` (or nothing) for the success commit path.
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
