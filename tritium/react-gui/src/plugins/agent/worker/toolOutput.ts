/**
 * @file plugins/agent/worker/toolOutput.ts
 * @description Turning a worker service's answer into something the model can
 * read.
 *
 * Two jobs, both of which exist because the services predate this plugin.
 *
 * First, normalisation. Three result dialects grew side by side: the current
 * `Result<T>` (`{ ok: false, error, code? }`), a bare `{ ok: boolean }` with
 * no reason, and `{ ok, error?, count? }`. A model told only `ok: false` will
 * retry the same call forever, so a failure without a reason is given one.
 *
 * Second, size. A service answers at whatever length the scene happens to be
 * -- every residue of a chain, every property of a renderer -- and a model
 * charged per token does not need all of it. Arrays are cut to a bound and
 * the payload is capped, with the fact that something was cut stated in the
 * output rather than left for the model to infer from a truncated list.
 */

import type { ToolOutcome } from './tools/types'

/** Longest array the model is shown before the tail is summarised away. */
export const MAX_ARRAY_ITEMS = 200

/** Hard ceiling on one tool result, in characters of JSON. */
export const MAX_OUTPUT_CHARS = 8192

/** The failure shapes a service may answer with, across all three dialects. */
interface ServiceResultLike {
  ok?: unknown
  error?: unknown
  code?: unknown
}

/**
 * A service result as a tool outcome.
 *
 * @param result - whatever the service returned.
 * @param fallbackError - the reason to report when the service gave none.
 *   Write it so the model can act on it ("no renderer with that id"), not as
 *   a restatement that something failed.
 */
export function normalizeServiceResult(
  result: unknown,
  fallbackError: string,
): ToolOutcome {
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
  // with just their data). Strip the flag: it says nothing to the model.
  const { ok: _ok, ...data } = r as Record<string, unknown>
  void _ok
  return { ok: true, data }
}

/** Recursively bound arrays, noting what was left out. */
function truncate(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY_ITEMS).map((v) => truncate(v, depth + 1))
    if (value.length > MAX_ARRAY_ITEMS) {
      head.push(`...${value.length - MAX_ARRAY_ITEMS} more of ${value.length} omitted`)
    }
    return head
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = truncate(v, depth + 1)
    }
    return out
  }
  return value
}

/**
 * The JSON string sent back as the function call's output.
 *
 * The Responses API has no error flag on a function output, so the outcome is
 * carried in the payload as `ok` and the system prompt tells the model that
 * `ok: false` means the call failed.
 */
export function serializeToolOutput(outcome: ToolOutcome): string {
  const body = outcome.ok
    ? { ok: true, ...(outcome.data === undefined ? {} : { result: truncate(outcome.data) }) }
    : { ok: false, error: outcome.error }
  let text: string
  try {
    text = JSON.stringify(body)
  } catch {
    return JSON.stringify({ ok: false, error: 'The result could not be serialized.' })
  }
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return (
    JSON.stringify({
      ok: outcome.ok,
      truncated: true,
      note: `Result too large (${text.length} chars); showing the first ${MAX_OUTPUT_CHARS}.`,
    }).slice(0, -1) + ',"head":' + JSON.stringify(text.slice(0, MAX_OUTPUT_CHARS)) + '}'
  )
}

/** One line describing an outcome, for the transcript. */
export function summarizeOutcome(outcome: ToolOutcome): string {
  if (!outcome.ok) return outcome.error
  if (outcome.data === undefined) return 'OK'
  const text = (() => {
    try { return JSON.stringify(outcome.data) } catch { return '[unserializable]' }
  })()
  return text.length > 200 ? `${text.slice(0, 200)}...` : text
}
