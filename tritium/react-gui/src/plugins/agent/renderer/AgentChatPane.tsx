/**
 * @file plugins/agent/renderer/AgentChatPane.tsx
 * @description The AI Agent side pane: transcript plus composer.
 *
 * Holds no conversation state of its own. A side pane unmounts whenever the
 * user switches activity view, so everything that has to survive that lives
 * in the session store, and the handlers come from the plugin's Root.
 */

import React, { useCallback, useState } from 'react'
import {
  PaneSectionHeader,
  useCommands,
  useCueMol,
} from '@renderer/plugin-host/api'
import type { PaneComponent } from '@renderer/plugin-host/api'
import { FormButton, TextAreaField } from '@renderer/h3-kit/form'
import { CmdId } from '@renderer/commands/ids'
import { AgentTranscript } from './AgentTranscript'
import { useAgentSession } from './agentSessionStore'

void React

export const AgentChatPane: PaneComponent = ({ collapsed, onToggleCollapse }) => {
  const { cm } = useCueMol()
  const { transcript, running, runner } = useAgentSession()
  const { dispatch } = useCommands()
  const [draft, setDraft] = useState('')

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
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter is a newline, the convention every
                // chat composer uses.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <div className="agent-composer-actions">
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
