/**
 * @file utils/fireService.ts
 * @description Fire-and-forget worker-service invocation helper.
 *
 * Many pane mutation handlers dispatch a worker service for its side effect
 * only and do not inspect the result -- they just need a uniform "log a
 * warning if the call rejects" tail. This helper collapses the repeated
 * `cm.invokeService(name, args).catch((err) => console.warn('X failed:', err))`
 * shape into a single call so the error policy lives in one place.
 *
 * It does not return the promise and never throws: a rejected invocation is
 * reported through the shared error sink only. Routing failures to a toast (or
 * any other UI surface) later is a one-line change inside `reportError` here,
 * with no edits at the ~19 call sites.
 */

import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ServiceArgs, ServiceKey } from '@renderer/worker/shared/calls'

/**
 * Report a fire-and-forget service failure. Single sink so a future
 * toast-on-error is a one-line change here, not at every call site.
 *
 * @param name - the service name that rejected
 * @param err - the rejection reason
 */
function reportError(name: string, err: unknown): void {
    console.warn(`${name} failed:`, err)
}

/**
 * Invoke a worker service for its side effect only, discarding the result and
 * logging a warning if it rejects.
 *
 * Use this only for genuinely fire-and-forget mutations. Callers that await the
 * result, inspect `{ ok }`, or need bespoke error handling must call
 * `cm.invokeService(...)` directly.
 *
 * @param cm - the AsyncCueMol client (non-null; guard before calling)
 * @param name - the service name
 * @param args - the service arguments
 */
export function fireService<K extends ServiceKey>(
    cm: AsyncCueMol,
    name: K,
    args: ServiceArgs<K>,
): void {
    cm.invokeService(name, args).catch((err: unknown) => {
        reportError(name, err)
    })
}
