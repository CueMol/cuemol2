/**
 * @file worker/shared/serviceResult.ts
 * @description Reading a worker service's answer when the caller cannot know
 * which dialect it speaks.
 *
 * Three result shapes grew side by side as the services were written: the
 * current `Result<T>` (`{ ok: false, error, code? }`), a bare `{ ok: boolean }`
 * carrying no reason, and `{ ok, error?, count? }`. Code that dispatches over
 * many services at once -- a tool catalogue, a command console -- would
 * otherwise have to branch per service, and a failure that arrives without a
 * reason reaches the user as "it failed" with nothing to act on.
 *
 * So a caller supplies the reason to fall back to, phrased as something the
 * reader can do next ("no renderer with that id"), and gets one shape back.
 */

/** A service answer reduced to one shape. */
export type NormalizedResult = { ok: true; data?: unknown } | { ok: false; error: string }

/** The failure shapes a service may answer with, across all three dialects. */
interface ServiceResultLike {
  ok?: unknown
  error?: unknown
  code?: unknown
}

/**
 * A service result in one shape.
 *
 * @param result - whatever the service returned.
 * @param fallbackError - the reason to report when the service gave none.
 *   Write it so the reader can act on it, not as a restatement that something
 *   failed.
 */
export function normalizeServiceResult(
  result: unknown,
  fallbackError: string,
): NormalizedResult {
  if (result === null || result === undefined) {
    return { ok: false, error: fallbackError }
  }
  if (typeof result !== 'object') {
    return { ok: true, data: result }
  }
  const r = result as ServiceResultLike
  if (r.ok === false) {
    const error = typeof r.error === 'string' && r.error !== '' ? r.error : fallbackError
    return { ok: false, error }
  }
  // `ok: true` or a plain payload with no flag at all (a few reads answer
  // with just their data). Strip the flag: it carries nothing for the caller.
  const { ok: _ok, ...data } = r as Record<string, unknown>
  void _ok
  return { ok: true, data }
}
