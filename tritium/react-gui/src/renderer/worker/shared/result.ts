/**
 * @file renderer/worker/shared/result.ts
 * @description The one result shape a worker service returns.
 *
 * Three failure conventions had grown side by side in the services: 466
 * `return { ok: false }` sites (97 of them carrying a reason), 15 files that
 * threw, and 75 `return null`. A throw is not just a different spelling -- it
 * crosses the wire as a *rejected promise* (WorkerService.invoke's catch posts
 * `[method, seqno, false, String(e)]`), so the renderer had to know per call
 * whether to check `.ok` or to `try/catch`, and a service that switched between
 * the two silently changed its contract.
 *
 * Rule: a service never throws across the boundary. It returns `Ok<T>` or
 * `Fail`, and `Fail.error` is required -- a failure with no reason is the
 * silent-failure UX this file exists to remove. `WorkerService.invoke` keeps
 * its catch as a last resort for genuine bugs, and logs those as contract
 * violations.
 *
 * `null` stays legitimate for *lookups* (`getSceneOrNull`, `makeSel`) and for
 * wire results whose type says `X | null`; it is not a failure signal for a
 * service entry point.
 */

/** Machine-readable failure class; `error` stays the human-readable reason. */
export type FailCode =
    | 'not-found'     // a scene / object / renderer / view id did not resolve
    | 'invalid-args'  // bad selection string, empty name, out-of-range index
    | 'unsupported'   // feature absent in this build, or wrong object class
    | 'canceled'      // the user cancelled (stream downloads, jobs)
    | 'io'            // file / network / external process
    | 'native';       // the C++ wrapper threw

export type Ok<T extends object = Record<never, never>> = { ok: true } & T;

export interface Fail {
    ok: false;
    error: string;
    code?: FailCode;
}

export type Result<T extends object = Record<never, never>> = Ok<T> | Fail;

/** A successful result, optionally carrying data. */
export function ok(): Ok;
export function ok<T extends object>(data: T): Ok<T>;
export function ok<T extends object>(data?: T): Ok<T> {
    // Flag last, so a payload cannot overwrite it.
    return { ...(data ?? {}), ok: true } as Ok<T>;
}

/** A failed result with a reason. */
export function fail(error: string, code?: FailCode): Fail {
    return code ? { ok: false, error, code } : { ok: false, error };
}

/**
 * A failed result from a caught value.
 *
 * Uses `Error.message` rather than `String(e)`, so the wire does not carry an
 * "Error: " prefix that every dialog would then display.
 */
export function failFrom(e: unknown, code: FailCode = 'native'): Fail {
    return fail(e instanceof Error ? e.message : String(e), code);
}

/** Narrow a result to its success branch. */
export function isOk<T extends object>(r: Result<T>): r is Ok<T> {
    return r.ok;
}
