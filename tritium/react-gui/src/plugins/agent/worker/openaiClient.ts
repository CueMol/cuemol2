/**
 * @file plugins/agent/worker/openaiClient.ts
 * @description The OpenAI client, constructed where the turn runs.
 *
 * A seam as much as a factory: `turnLoop` takes this as a dependency so a
 * test can hand it a fake and drive a whole turn without a network or a key.
 *
 * The SDK is isomorphic -- it needs `fetch`, `AbortController` and
 * `ReadableStream`, all of which the Web Worker has. Its browser check looks
 * for `window.document`, which a worker does not have, so it does not fire;
 * `dangerouslyAllowBrowser` is belt and braces in case that check ever widens
 * to "not Node". Nothing here reaches the DOM either way.
 */

import OpenAI from 'openai'

/**
 * A client for one turn.
 *
 * @param apiKey - passed straight through from the caller; never stored.
 * @remarks `maxRetries: 2` covers a transient 429 / 5xx without turning a
 *   genuine outage into a minutes-long wait the user cannot see into.
 */
export function createOpenAIClient(apiKey: string): AgentOpenAIClient {
  const client = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  })
  // The SDK's `create` is overloaded on the `stream` flag, and the streaming
  // branch is the only one used here; the cast picks it.
  return client as unknown as AgentOpenAIClient
}

/**
 * One event of a streamed response.
 *
 * Left open rather than typed against the SDK's event union: `turnLoop`
 * branches on a handful of `type` values and reads two fields, and pinning
 * the whole union here would make a test fake as large as the SDK.
 */
export interface AgentStreamEvent {
  type: string
  /** Present on `response.output_text.delta`. */
  delta?: string
  /** Present on the terminal events. */
  response?: {
    output?: unknown[]
    status?: string
    error?: { message?: string }
    usage?: {
      input_tokens?: number
      output_tokens?: number
      input_tokens_details?: { cached_tokens?: number }
    }
  }
  /** Present on a transport-level `error` event. */
  message?: string
}

/**
 * The surface `turnLoop` uses.
 *
 * Narrow on purpose: this is the seam a test replaces, and a test fake should
 * be a few lines rather than a stub of the whole SDK.
 */
export interface AgentOpenAIClient {
  responses: {
    create(
      body: Record<string, unknown>,
      options: { signal: AbortSignal },
    ): Promise<AsyncIterable<AgentStreamEvent>>
  }
}

/** How `turnLoop` obtains its client. Overridden in tests. */
export type CreateClient = (apiKey: string) => AgentOpenAIClient
