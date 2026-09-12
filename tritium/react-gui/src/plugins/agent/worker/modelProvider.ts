/**
 * @file plugins/agent/worker/modelProvider.ts
 * @description Turning a model spec into something `streamText` can run, and
 * a failure into something the user can act on.
 *
 * Everything provider-specific about the request lives here. The loop itself
 * (`turnLoop.ts`) names no provider: it takes a model and a bag of provider
 * options and drives the same stream either way.
 *
 * A seam as much as a factory -- `turnLoop` takes `createModel` as a
 * dependency so a test can hand it a mock model and drive a whole turn with
 * no network and no key.
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { APICallError, RetryError, StreamProviderError, type streamText } from 'ai'
import type { LanguageModel } from 'ai'
import type { ModelSpec } from '../shared/modelSpec'

/**
 * The shape `streamText` takes for provider-specific request options.
 *
 * Derived from the function rather than imported: `ai` declares the type but
 * does not export it, and deriving keeps this file's dependency on `ai`
 * alone instead of reaching into `@ai-sdk/provider`.
 */
type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>

/**
 * A model for one turn.
 *
 * The key is passed in rather than read from the environment: it lives in the
 * OS keychain and reaches the worker as a call argument, and the SDK's own
 * env lookup throws in a Worker anyway.
 *
 * @remarks Never hand `streamText` a bare model string -- `'anthropic/x'`
 *   routes through the Vercel AI Gateway instead of the provider.
 */
export function createModel(spec: ModelSpec, apiKey: string): LanguageModel {
  if (spec.provider === 'anthropic') {
    return createAnthropic({
      apiKey,
      // The provider does not set this itself, and Anthropic refuses a
      // browser-origin request without it. The worker is such an origin.
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    })(spec.modelId)
  }
  return createOpenAI({ apiKey })(spec.modelId)
}

/** How `turnLoop` obtains its model. Overridden in tests. */
export type CreateModel = (spec: ModelSpec, apiKey: string) => LanguageModel

/**
 * The provider-specific request options that do not change between turns.
 *
 * Anything to do with reasoning is deliberately absent, for the same reason
 * in both directions: the SDK fills these in from `streamText`'s top-level
 * `reasoning`, and only when we have left them unset.
 *
 * For OpenAI, writing `reasoningEffort` here makes it ignore the top-level
 * value rather than merge with it. For Anthropic it is worse than that --
 * the SDK picks the thinking configuration the MODEL supports (adaptive plus
 * an effort where there is one, a token budget where there is not), and
 * setting `thinking` ourselves skips that choice entirely. Hardcoding
 * adaptive is how every request to Claude Haiku 4.5 came back with
 * "adaptive thinking is not supported on this model".
 */
export function providerOptionsFor(spec: ModelSpec): ProviderOptions {
  // Nothing to add for Anthropic: the SDK derives the thinking configuration
  // from the model and the requested reasoning level.
  if (spec.provider === 'anthropic') return {}
  return {
    openai: {
      // The conversation is ours, replayed from the renderer each turn.
      store: false,
      // Without this the reasoning behind a tool call cannot be replayed on
      // the next round, and the model re-derives it every time.
      include: ['reasoning.encrypted_content'],
      // v7 turns summaries on by default once an effort is set. Nothing
      // reads them here, and they are billed.
      reasoningSummary: null,
    },
  }
}

/** Human-readable provider name for a message the user will read. */
const PROVIDER_LABEL: Record<ModelSpec['provider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

/** The HTTP status behind a failure, through whatever the SDK wrapped it in. */
function statusOf(error: unknown): number | undefined {
  if (APICallError.isInstance(error)) return error.statusCode
  if (StreamProviderError.isInstance(error)) return error.statusCode
  return undefined
}

/**
 * Unwrap the error the user should hear about.
 *
 * A failure that exhausted its retries arrives wrapped in `RetryError`; the
 * last attempt is the one worth reporting. A failure on the first attempt is
 * not wrapped at all.
 */
function unwrap(error: unknown): unknown {
  if (!RetryError.isInstance(error)) return error
  return error.lastError ?? error.errors.at(-1) ?? error
}

/**
 * What went wrong, said so the user knows what to change.
 *
 * Names the provider and the settings row, because with two providers
 * configured "invalid API key" alone does not say which one to fix.
 */
export function describeApiError(error: unknown, spec: ModelSpec): string {
  const inner = unwrap(error)
  const status = statusOf(inner)
  const message = inner instanceof Error ? inner.message : String(inner)
  const label = PROVIDER_LABEL[spec.provider]

  if (status === 401 || status === 403) {
    return `Invalid ${label} API key (${status}). Check Settings > Plugins > AI Agent.`
  }
  if (status === 404) {
    return `Unknown model "${spec.modelId}" (404). Check the model in Settings. ${message}`
  }
  if (status === 429) {
    return `Rate limited by ${label} (429). Wait a moment and try again.`
  }
  if (status === 529) {
    return `${label} is overloaded (529). Try again shortly.`
  }
  return message
}
