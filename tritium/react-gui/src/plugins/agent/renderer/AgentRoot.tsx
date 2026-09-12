/**
 * @file plugins/agent/renderer/AgentRoot.tsx
 * @description Mounted while the plugin is enabled. Draws nothing.
 *
 * The turn runner has to outlive the chat pane, which unmounts whenever the
 * user switches activity view, so it lives here instead.
 */

import React from 'react'
import { useAgentTurnRunner } from './useAgentTurnRunner'

void React

export const AgentRoot: React.FC = () => {
  useAgentTurnRunner()
  return null
}
AgentRoot.displayName = 'AgentRoot'
