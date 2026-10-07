/**
 * @file plugins/agent/worker/toolOutput.ts
 * @description Turning a worker service's answer into something the model can
 * read.
 *
 * The JSON text and its size bounds are the catalogue's
 * (`catalog/toolOutput.ts`), shared with the MCP server; what is here is the
 * AI SDK's side: the picture beside the text, and the transcript line.
 *
 * Reading the three result dialects the services speak is not specific to a
 * model, so that half lives in `worker/shared/serviceResult` and is
 * re-exported here for the tools that already call it.
 */

import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { MAX_ARRAY_ITEMS, MAX_OUTPUT_CHARS, serializeToolOutput } from '@renderer/worker/server/catalog'
import type { Tool } from 'ai'
import type { ToolImage, ToolOutcome } from './tools/types'

/**
 * What `toModelOutput` returns. Derived rather than imported: `ai` uses the
 * type without exporting it (the same reason as `ProviderOptions` in
 * `modelProvider.ts`).
 */
type ToolResultOutput = Awaited<ReturnType<NonNullable<Tool['toModelOutput']>>>

export { MAX_ARRAY_ITEMS, MAX_OUTPUT_CHARS, normalizeServiceResult, serializeToolOutput }

/** What `runQueued` resolves to: the JSON text, plus the picture if there is one. */
export type ToolRunOutput = string | { text: string; image: ToolImage }

/**
 * The tool result as the model receives it.
 *
 * A plain string becomes a text output, which is exactly what the SDK does
 * when a tool has no `toModelOutput` -- so the tools that return no picture
 * send the same bytes as before. A picture goes as a file part after the
 * text, which each provider maps to its own image block inside the tool
 * result.
 */
export function toolModelOutput(output: ToolRunOutput): ToolResultOutput {
  if (typeof output === 'string') return { type: 'text', value: output }
  return {
    type: 'content',
    value: [
      { type: 'text', text: output.text },
      {
        type: 'file',
        mediaType: output.image.mediaType,
        data: { type: 'data', data: output.image.base64 },
      },
    ],
  }
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
