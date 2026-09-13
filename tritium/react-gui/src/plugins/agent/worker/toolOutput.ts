/**
 * @file plugins/agent/worker/toolOutput.ts
 * @description Turning a worker service's answer into something the model can
 * read.
 *
 * Size is the concern here. A service answers at whatever length the scene
 * happens to be -- every residue of a chain, every property of a renderer --
 * and a model charged per token does not need all of it. Arrays are cut to a
 * bound and the payload is capped, with the fact that something was cut
 * stated in the output rather than left for the model to infer from a
 * truncated list.
 *
 * Reading the three result dialects the services speak is not specific to a
 * model, so that half lives in `worker/shared/serviceResult` and is
 * re-exported here for the tools that already call it.
 */

import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import type { ToolOutcome } from './tools/types'

export { normalizeServiceResult }

/** Longest array the model is shown before the tail is summarised away. */
export const MAX_ARRAY_ITEMS = 200

/** Hard ceiling on one tool result, in characters of JSON. */
export const MAX_OUTPUT_CHARS = 8192

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
