/**
 * @file plugins/agent/shared/modelSpec.ts
 * @description Which provider a model name belongs to, and what of a
 * conversation survives moving between providers.
 *
 * Pure: no SDK import, because both halves of the plugin need it. The worker
 * builds a model from the spec; the renderer needs the provider to know which
 * API key to read before it can start a turn at all.
 */

import type { ModelMessage } from 'ai'

/** The model vendors this plugin can talk to. */
export type Provider = 'openai' | 'anthropic'

export const PROVIDERS: readonly Provider[] = ['openai', 'anthropic']

export interface ModelSpec {
  provider: Provider
  /** The id as the provider knows it, with the prefix stripped. */
  modelId: string
}

/**
 * The provider a settings value names, written `provider:model`.
 *
 * A bare id means OpenAI. That is not a default so much as a compatibility
 * rule: the setting predates this plugin having two providers, so an
 * installation that already stored `gpt-5.6` keeps working.
 *
 * @returns the spec, or `{ error }` with something the user can act on.
 */
export function parseModelSpec(raw: string): ModelSpec | { error: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { error: 'No model is set. Choose one in Settings > Plugins > AI Agent.' }

  const colon = trimmed.indexOf(':')
  if (colon < 0) return { provider: 'openai', modelId: trimmed }

  const provider = trimmed.slice(0, colon)
  const modelId = trimmed.slice(colon + 1).trim()
  if (!isProvider(provider)) {
    return {
      error:
        `"${provider}" is not a known provider. Write the model as ` +
        `${PROVIDERS.map((p) => `${p}:<model>`).join(' or ')}.`,
    }
  }
  if (modelId === '') return { error: `No model named after "${provider}:".` }
  return { provider, modelId }
}

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value)
}

/** The spec written back as a settings value. */
export function formatModelSpec(spec: ModelSpec): string {
  return `${spec.provider}:${spec.modelId}`
}

/**
 * The conversation with the other provider's reasoning removed.
 *
 * A reasoning part carries state only its own provider can read -- OpenAI's
 * encrypted content, Anthropic's thinking signature -- under that provider's
 * key in `providerOptions`. What happens when the other one receives it is
 * undocumented, and the failure would be a rejected turn rather than
 * something we could recover from, so the parts are dropped instead.
 *
 * Everything the user can see is kept: text, tool calls and tool results. The
 * model loses the chain of thought behind its earlier answers, not the
 * answers.
 *
 * @param provider - the provider the conversation is about to be sent to.
 */
export function sanitizeHistory(
  history: readonly ModelMessage[],
  provider: Provider,
): ModelMessage[] {
  return history.map((message) => {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) return message

    const kept = message.content.filter((part) => {
      if (part.type !== 'reasoning') return true
      // Its own provider's metadata present: this reasoning belongs here.
      return part.providerOptions?.[provider] !== undefined
    })
    return kept.length === message.content.length ? message : { ...message, content: kept }
  })
}
