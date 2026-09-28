/**
 * @file plugins/agent/shared/modelCatalog.ts
 * @description Which of the suggested models an account can actually use.
 *
 * The provider's own model list says what a key may call, but not what can
 * run a turn: OpenAI's carries no capability data at all, and every list
 * mixes in embedding, image and audio models. The suggestions say what can
 * run a turn, but not what this account may call. The panel offers the
 * intersection.
 *
 * Pure, so the matching can be tested without a network or a key.
 */

import { AGENT_MODEL_SUGGESTIONS } from './agentTypes'
import { PROVIDERS, parseModelSpec } from './modelSpec'
import type { Provider } from './modelSpec'

/** One suggestion, split into its provider and bare id. */
export interface ModelChoice {
  /** The stored setting value, `provider:model`. */
  value: string
  provider: Provider
  modelId: string
  label: string
}

/** The suggestions, grouped by provider in declaration order. */
export const MODEL_CHOICES: Record<Provider, ModelChoice[]> = Object.fromEntries(
  PROVIDERS.map((provider) => [
    provider,
    AGENT_MODEL_SUGGESTIONS.flatMap((s) => {
      const spec = parseModelSpec(s.value)
      if ('error' in spec || spec.provider !== provider) return []
      return [{ value: s.value, provider, modelId: spec.modelId, label: s.label }]
    }),
  ]),
) as Record<Provider, ModelChoice[]>

/** A dated snapshot of an alias, as Anthropic lists them: `<alias>-YYYYMMDD`. */
const SNAPSHOT_SUFFIX = /^-\d{8}$/

/**
 * The suggestions the provider listed for this key.
 *
 * A suggestion counts when the list has its exact id, or a dated snapshot of
 * it -- Anthropic has listed only `claude-x-20250101` for a model callable as
 * `claude-x`. Nothing looser than that: a prefix match would take
 * `claude-opus-5-5` as evidence for `claude-opus-5`.
 *
 * @param listedIds - bare ids, as the provider's model list returns them.
 */
export function availableChoices(
  choices: readonly ModelChoice[],
  listedIds: readonly string[],
): ModelChoice[] {
  const listed = new Set(listedIds)
  return choices.filter(
    (c) =>
      listed.has(c.modelId) ||
      listedIds.some(
        (id) => id.startsWith(c.modelId) && SNAPSHOT_SUFFIX.test(id.slice(c.modelId.length)),
      ),
  )
}
