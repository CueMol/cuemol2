/**
 * @file plugins/agent/calls.ts
 * @description How the panel reaches the worker, the stream, and the key.
 *
 * The three lanes this plugin owns, declared in one place:
 *   - two worker services, on the wire as `plugin.agent.<name>`;
 *   - one push channel the running turn streams progress on;
 *   - one credential per provider, kept in the OS keychain by the host.
 *
 * The call contract is a `type`, not an `interface`: only a type alias of an
 * object literal gets the implicit index signature `definePluginServices`
 * needs.
 */

import {
  definePluginChannel,
  definePluginSecret,
  definePluginServices,
} from '@renderer/plugin-host/api'
import type { Result } from '@renderer/worker/shared/result'
import { AGENT_PLUGIN_ID, AGENT_SECRETS } from './shared/agentTypes'
import type {
  AgentProgressUpdate,
  AgentRunTurnArgs,
  AgentRunTurnResult,
} from './shared/agentTypes'
import { PROVIDERS } from './shared/modelSpec'
import type { Provider } from './shared/modelSpec'
import type { PluginSecret } from '@renderer/plugin-host/api'

export type AgentCalls = {
  runTurn: { args: AgentRunTurnArgs; result: AgentRunTurnResult }
  cancelTurn: { args: { turnId: string }; result: Result }
}

/** Checked against what the worker actually registers by plugins/index.test.ts. */
export const AGENT_KEYS = ['runTurn', 'cancelTurn'] as const satisfies readonly (keyof AgentCalls)[]

export const agentServices = definePluginServices<AgentCalls>(AGENT_PLUGIN_ID)

/**
 * Progress from the running turn. The worker pushes on the same name, derived
 * from `pluginChannelName` on its side (see `shared/agentTypes.ts`).
 */
export const agentProgress = definePluginChannel<AgentProgressUpdate>(AGENT_PLUGIN_ID, 'progress')

/**
 * One API key per provider: stored encrypted, or taken from the environment.
 *
 * A turn reads only the key for the provider its model names, so an
 * installation that uses one provider never has to fill in the other.
 */
export const agentApiKeys: Record<Provider, PluginSecret> = Object.fromEntries(
  PROVIDERS.map((provider) => [
    provider,
    definePluginSecret(AGENT_PLUGIN_ID, AGENT_SECRETS[provider].key, {
      envVar: AGENT_SECRETS[provider].envVar,
    }),
  ]),
) as Record<Provider, PluginSecret>
