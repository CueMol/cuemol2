/**
 * @file hooks/useMolEditCommit.ts
 * @description Shared commit scaffold for the molecule-edit dialogs. It owns
 * the three pieces every such dialog repeated verbatim:
 *   - the `submitting` / `errorMsg` state pair,
 *   - the commit `run()` wrapper: set submitting, clear the error, await the
 *     caller-supplied service call, branch on `res.ok` (success callback vs
 *     inline `errorMsg`), and convert a thrown error into
 *     `setErrorMsg(String(err))`,
 *   - the reset-on-open of the transient `submitting` / `errorMsg` flags (the
 *     dialog component stays mounted across show/hide cycles).
 *
 * The actual `cm.invokeService('name', payload)` call stays at the callsite
 * (inside `buildCommit().invoke`) so it keeps its generated per-service
 * argument/result typing -- the hook only owns the surrounding try/catch and
 * state machine.
 *
 * What it deliberately does NOT own: the per-dialog body fields and their own
 * reset-on-open. Each dialog clears only what it actually clears via the
 * `onReset` callback -- this is intentionally non-uniform (e.g. `objId` is not
 * reset so the last-picked molecule persists; `MolSuperpose` runs an async
 * fetch with a cancelled flag; `MergeMol` resets `copy=true`). Forcing a
 * blanket reset here would break that last-picked persistence.
 *
 * `run()` is multi-site callable: the two Alert-gated dialogs invoke it from
 * both their OK handler and the confirm `Alert.onConfirm`.
 */

import { useCallback, useEffect, useState } from 'react'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'

/**
 * One commit attempt produced by the caller's `buildCommit`. The `invoke`
 * thunk performs the typed `cm.invokeService(...)` call; `onSuccess` runs the
 * dialog's history pushes + `onConfirm` once the result is `ok`.
 *
 * @typeParam TRes - the worker service result shape (carries `ok` / `error`).
 */
export interface MolEditCommit<TRes extends { ok?: boolean; error?: string }> {
    /** Performs the (typed) worker service call and resolves its result. */
    invoke: () => Promise<TRes | undefined>
    /** Called once on `res.ok`; performs history pushes + `onConfirm`. */
    onSuccess: (res: TRes) => void
    /** Error text when `res.ok` is false and `res.error` is absent. */
    fallbackError: string
}

export interface UseMolEditCommitOptions<TRes extends { ok?: boolean; error?: string }> {
    /** Worker facade; commit is a no-op while null. */
    cm: AsyncCueMol | null
    /** Whether the dialog is currently open (drives reset-on-open). */
    visible: boolean
    /**
     * Builds the commit from current dialog state, or returns null to abort
     * silently (guard failed -- e.g. nothing picked). Returning null does NOT
     * touch submitting / errorMsg.
     */
    buildCommit: () => MolEditCommit<TRes> | null
    /**
     * Per-dialog reset run on each open, after the shared `submitting` /
     * `errorMsg` flags are cleared. Clear ONLY the fields this dialog owns.
     */
    onReset?: () => void
}

export interface UseMolEditCommitResult {
    /** True while a commit is in flight (drives the OK spinner). */
    submitting: boolean
    /** Inline error message (null = none); pass to `DialogShell.errorMsg`. */
    errorMsg: string | null
    /** Imperatively clear / set the error (e.g. on an input change). */
    setErrorMsg: (msg: string | null) => void
    /**
     * Run one commit attempt. Safe to call from multiple sites (OK handler and
     * a confirm Alert). No-op when `cm` is null or `buildCommit` returns null.
     */
    run: () => Promise<void>
}

/**
 * Provides the molecule-edit commit state + `run()` wrapper + reset-on-open.
 *
 * @typeParam TRes - the worker service result shape.
 */
export function useMolEditCommit<TRes extends { ok?: boolean; error?: string }>(
    options: UseMolEditCommitOptions<TRes>,
): UseMolEditCommitResult {
    const { cm, visible, buildCommit, onReset } = options
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Reset transient flags on each open, then let the dialog clear its own
    // owned fields. The provider keeps the component mounted across show/hide
    // cycles, so leftover flags would otherwise stick.
    useEffect(() => {
        if (!visible) return
        setSubmitting(false)
        setErrorMsg(null)
        onReset?.()
        // onReset is intentionally excluded: callers pass a fresh closure each
        // render, and the reset must run on open transitions only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible])

    const run = useCallback(async () => {
        if (!cm) return
        const commit = buildCommit()
        if (!commit) return
        setSubmitting(true)
        setErrorMsg(null)
        try {
            const res = await commit.invoke()
            setSubmitting(false)
            if (res?.ok) {
                commit.onSuccess(res)
            } else {
                setErrorMsg(res?.error ?? commit.fallbackError)
            }
        } catch (err) {
            setErrorMsg(String(err))
            setSubmitting(false)
        }
    }, [cm, buildCommit])

    return { submitting, errorMsg, setErrorMsg, run }
}
