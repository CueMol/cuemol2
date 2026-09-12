/**
 * @file plugins/agent/index.ts
 * @description The AI agent panel: a chat that drives the scene.
 *
 * The user says what they want to see; a model calls the same worker services
 * the rest of the app calls, inside a single undo transaction, and the panel
 * streams what it is doing. See docs/architecture/ai-agent-plugin.md.
 *
 * Off by default. It needs an API key the user pays for, so it is something
 * to opt into from Settings > Plugins rather than an icon everyone finds in
 * the activity bar.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import type { RendererPlugin } from '@renderer/plugin-host/api'
import { AgentChatPane } from './renderer/AgentChatPane'
import { AgentRoot } from './renderer/AgentRoot'
import {
  AGENT_MODEL_SUGGESTIONS,
  AGENT_PLUGIN_ID,
  AGENT_PREF_KEYS,
  AGENT_SECRETS,
  DEFAULT_AGENT_MODEL,
  DEFAULT_ENTER_KEY,
  ENTER_KEY_OPTIONS,
} from './shared/agentTypes'
import './renderer/agent-chat.css'

export const agentPlugin: RendererPlugin = /* @__PURE__ */ definePlugin({
  manifest: {
    id: AGENT_PLUGIN_ID,
    name: 'AI Agent',
    version: '1.0.0',
    description:
      'Chat panel that builds the scene for you: a model calls the same operations the ' +
      'menus do. Works with OpenAI or Anthropic; needs your own API key.',
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
            'Which model each turn runs on, written provider:model. Pick one of the ' +
            'suggestions, or type any id your account can use; an unknown one is reported ' +
            'in the panel as a 404. The provider decides which API key below is used.',
          control: {
            kind: 'combo',
            options: [...AGENT_MODEL_SUGGESTIONS],
            placeholder: DEFAULT_AGENT_MODEL,
          },
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
          key: AGENT_PREF_KEYS.enterKey,
          label: 'Pressing Enter',
          description:
            'What Enter does in the message box. With "start a new line", Cmd+Enter or ' +
            'Ctrl+Enter sends instead.',
          control: {
            kind: 'select',
            options: [ENTER_KEY_OPTIONS.newline, ENTER_KEY_OPTIONS.send],
          },
          default: DEFAULT_ENTER_KEY,
        },
        {
          key: AGENT_SECRETS.openai.key,
          label: 'OpenAI API key',
          description:
            'Used when the model is an openai: one. Stored encrypted by the operating ' +
            `system, never in the settings file. Falls back to the ` +
            `${AGENT_SECRETS.openai.envVar} environment variable when nothing is stored.`,
          control: { kind: 'secret', envVar: AGENT_SECRETS.openai.envVar },
        },
        {
          key: AGENT_SECRETS.anthropic.key,
          label: 'Anthropic API key',
          description:
            'Used when the model is an anthropic: one. Stored encrypted by the operating ' +
            `system, never in the settings file. Falls back to the ` +
            `${AGENT_SECRETS.anthropic.envVar} environment variable when nothing is stored.`,
          control: { kind: 'secret', envVar: AGENT_SECRETS.anthropic.envVar },
        },
      ],
    },
  },
  Root: AgentRoot,
  panes: { chat: AgentChatPane },
})
