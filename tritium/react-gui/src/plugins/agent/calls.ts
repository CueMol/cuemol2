/**
 * @file plugins/agent/calls.ts
 * @description How the panel reaches the worker, the stream, and the key.
 *
 * The three lanes this plugin owns, declared in one place:
 *   - two worker services, on the wire as `plugin.agent.<name>`;
 *   - one push channel the running turn streams progress on;
 *   - one credential, kept in the OS keychain by the host.
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
import {
  AGENT_API_KEY_ENV,
  AGENT_PLUGIN_ID,
  AGENT_SECRET_KEY,
} from './shared/agentTypes'
import type {
  AgentProgressUpdate,
  AgentRunTurnArgs,
  AgentRunTurnResult,
} from './shared/agentTypes'

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

/** The OpenAI key: stored encrypted, or taken from the environment. */
export const agentApiKey = definePluginSecret(AGENT_PLUGIN_ID, AGENT_SECRET_KEY, {
  envVar: AGENT_API_KEY_ENV,
})
