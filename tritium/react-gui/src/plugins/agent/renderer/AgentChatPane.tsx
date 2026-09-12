/**
 * @file plugins/agent/renderer/AgentChatPane.tsx
 * @description The AI Agent side pane: transcript plus composer.
 *
 * Holds no conversation state of its own. A side pane unmounts whenever the
 * user switches activity view, so everything that has to survive that lives
 * in the session store, and the handlers come from the plugin's Root.
 */

import React, { useCallback, useMemo, useState } from 'react'
import {
  PaneSectionHeader,
  useCommands,
  useCueMol,
  usePluginPrefs,
} from '@renderer/plugin-host/api'
import type { PaneComponent } from '@renderer/plugin-host/api'
import { FormButton, TextAreaField } from '@renderer/h3-kit/form'
import type { SubmitKey } from '@renderer/h3-kit/form'
import { CmdId } from '@renderer/commands/ids'
import { AgentTranscript } from './AgentTranscript'
import { useAgentSession } from './agentSessionStore'
import {
  AGENT_PLUGIN_ID,
  AGENT_PREF_KEYS,
  ENTER_KEY_OPTIONS,
} from '../shared/agentTypes'

/** How the send shortcut is written on this platform. */
function sendHint(submitKey: SubmitKey): string {
  if (submitKey === 'enter') return 'Enter to send, Shift+Enter for a new line'
  const isMac = window.electronAPI?.platform === 'darwin'
  return isMac ? 'Cmd+Enter to send' : 'Ctrl+Enter to send'
}

void React

export const AgentChatPane: PaneComponent = ({ collapsed, onToggleCollapse }) => {
  const { cm } = useCueMol()
  const { transcript, running, runner } = useAgentSession()
  const { dispatch } = useCommands()
  const { prefs } = usePluginPrefs(AGENT_PLUGIN_ID)
  const [draft, setDraft] = useState('')

  const submitKey: SubmitKey = useMemo(
    () => (prefs[AGENT_PREF_KEYS.enterKey] === ENTER_KEY_OPTIONS.send ? 'enter' : 'modifier-enter'),
    [prefs],
  )

  const canSend = cm !== null && runner !== null && !running && draft.trim() !== ''

  const submit = useCallback(() => {
    if (!canSend || !runner) return
    runner.send(draft.trim())
    setDraft('')
  }, [canSend, runner, draft])

  const openSettings = useCallback(() => {
    void dispatch(CmdId.UiSettingsTab)
  }, [dispatch])

  return (
    <div className="sp-pane">
      <PaneSectionHeader
        title="AI Agent"
        icon="activity.agent"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && (
        <div className="agent-pane-body">
          <AgentTranscript entries={transcript} onOpenSettings={openSettings} />
          <div className="agent-composer">
            <TextAreaField
              value={draft}
              onChange={setDraft}
              placeholder={running ? 'Working...' : 'Ask for what you want to see'}
              disabled={running}
              ariaLabel="Message the AI agent"
              minRows={1}
              maxRows={6}
              onSubmit={submit}
              submitKey={submitKey}
            />
            <div className="agent-composer-actions">
              {/* The shortcut is not discoverable from a field that takes a
                  newline on Enter, so it is spelled out next to the button
                  that does the same thing. */}
              <span className="agent-composer-hint">{sendHint(submitKey)}</span>
              {running ? (
                <FormButton text="Stop" onClick={() => runner?.stop()} />
              ) : (
                <FormButton text="Send" intent="primary" onClick={submit} disabled={!canSend} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
AgentChatPane.displayName = 'AgentChatPane'
