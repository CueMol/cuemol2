/**
 * @file plugins/agent/index.ts
 * @description The AI agent panel: a chat that drives the scene.
 *
 * The user says what they want to see; a model calls the same worker services
 * the rest of the app calls, inside a single undo transaction, and the panel
 * streams what it is doing. See docs/architecture/ai-agent-plugin.md.
 *
 * Off by default. It needs an OpenAI API key the user pays for, so it is
 * something to opt into from Settings > Plugins rather than an icon everyone
 * finds in the activity bar.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import type { RendererPlugin } from '@renderer/plugin-host/api'
import { AgentChatPane } from './renderer/AgentChatPane'
import { AgentRoot } from './renderer/AgentRoot'
import {
  AGENT_API_KEY_ENV,
  AGENT_PLUGIN_ID,
  AGENT_PREF_KEYS,
  DEFAULT_AGENT_MODEL,
} from './shared/agentTypes'
import './renderer/agent-chat.css'

export const agentPlugin: RendererPlugin = /* @__PURE__ */ definePlugin({
  manifest: {
    id: AGENT_PLUGIN_ID,
    name: 'AI Agent (OpenAI)',
    version: '1.0.0',
    description:
      'Chat panel that builds the scene for you: an OpenAI model calls the same operations ' +
      'the menus do. Needs your own OpenAI API key.',
    defaultEnabled: false,
    contributes: {
      views: [
        {
          id: 'agent',
          title: 'AI Agent',
          icon: 'activity.agent',
          panes: [{ id: 'chat', defaultSize: 600 }],
        },
      ],
      settings: [
        {
          key: AGENT_PREF_KEYS.model,
          label: 'Model',
          description:
            'OpenAI model id used for each turn. An unknown id is reported in the panel as a 404.',
          control: { kind: 'text', mono: true },
          default: DEFAULT_AGENT_MODEL,
        },
        {
          key: AGENT_PREF_KEYS.reasoningEffort,
          label: 'Reasoning effort',
          description:
            'How long the model may think before answering. Higher is slower and costs more.',
          control: { kind: 'select', options: ['default', 'low', 'medium', 'high'] },
          default: 'low',
        },
        {
          key: 'openaiApiKey',
          label: 'OpenAI API key',
          description:
            `Stored encrypted by the operating system, never in the settings file. ` +
            `Falls back to the ${AGENT_API_KEY_ENV} environment variable when nothing is stored.`,
          control: { kind: 'secret', envVar: AGENT_API_KEY_ENV },
        },
      ],
    },
  },
  Root: AgentRoot,
  panes: { chat: AgentChatPane },
})
