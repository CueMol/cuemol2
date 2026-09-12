/**
 * @file plugins/agent/renderer/AgentChatPane.tsx
 * @description The AI Agent side pane: transcript plus composer.
 *
 * Holds no conversation state of its own. A side pane unmounts whenever the
 * user switches activity view, so everything that has to survive that lives
 * in the session store, and the handlers come from the plugin's Root.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  PaneSectionHeader,
  useCommands,
  useCueMol,
  usePluginPrefs,
} from '@renderer/plugin-host/api'
import type { PaneComponent } from '@renderer/plugin-host/api'
import { Button, ButtonGroup, Tooltip } from '@blueprintjs/core'
import { AppIcon } from '@renderer/h3-kit/primitives'
import { FormButton, TextAreaField, isImeKey } from '@renderer/h3-kit/form'
import type { SubmitKey } from '@renderer/h3-kit/form'
import { CmdId } from '@renderer/commands/ids'
import { AgentTranscript } from './AgentTranscript'
import { agentSession, useAgentSession } from './agentSessionStore'
import { IDLE, getHistory, pushHistory, recallDown, recallUp } from './promptHistory'
import type { RecallState } from './promptHistory'
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

/** Kept as a constant so the escape survives every editing pass. */
const NEWLINE = String.fromCharCode(10)

export const AgentChatPane: PaneComponent = ({ collapsed, onToggleCollapse }) => {
  const { cm } = useCueMol()
  const { transcript, running, runner } = useAgentSession()
  const { dispatch } = useCommands()
  const { prefs } = usePluginPrefs(AGENT_PLUGIN_ID)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Where the arrow keys currently are in the sent prompts. Not state: it
  // changes together with the draft, and a re-render for it alone is noise.
  const recallRef = useRef<RecallState>(IDLE)

  const submitKey: SubmitKey = useMemo(
    () => (prefs[AGENT_PREF_KEYS.enterKey] === ENTER_KEY_OPTIONS.send ? 'enter' : 'modifier-enter'),
    [prefs],
  )

  const canSend = cm !== null && runner !== null && !running && draft.trim() !== ''

  /** Replace the composer and leave the caret where typing continues. */
  const showRecalled = useCallback((text: string) => {
    setDraft(text)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) el.setSelectionRange(text.length, text.length)
    })
  }, [])

  const submit = useCallback(() => {
    if (!canSend || !runner) return
    const text = draft.trim()
    // Recorded even though the turn may fail: a prompt that did not work is
    // exactly the one worth getting back to reword.
    pushHistory(text)
    recallRef.current = IDLE
    runner.send(text)
    setDraft('')
  }, [canSend, runner, draft])

  /**
   * Shell-style recall on the arrow keys.
   *
   * Only when the caret is on the first or last line, so the arrows keep
   * moving the caret inside a draft that spans several lines. A key an input
   * method is using is left alone: during conversion the arrows pick a
   * candidate.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (isImeKey(e.nativeEvent)) return

      const el = e.currentTarget
      const caret = el.selectionStart ?? 0
      const end = el.selectionEnd ?? caret
      const onFirstLine = !el.value.slice(0, caret).includes(NEWLINE)
      const onLastLine = !el.value.slice(end).includes(NEWLINE)

      const step =
        e.key === 'ArrowUp'
          ? onFirstLine
            ? recallUp(recallRef.current, el.value, getHistory())
            : null
          : onLastLine
            ? recallDown(recallRef.current, getHistory())
            : null
      if (!step) return

      e.preventDefault()
      recallRef.current = step.state
      showRecalled(step.draft)
    },
    [showRecalled],
  )

  /** Typing ends the walk through history; what is in the box is now a draft. */
  const handleChange = useCallback((value: string) => {
    recallRef.current = IDLE
    setDraft(value)
  }, [])

  const openSettings = useCallback(() => {
    void dispatch(CmdId.UiSettingsTab)
  }, [dispatch])

  // Starting over drops what the model has been told as well as what is on
  // screen: a transcript the user cleared should not keep steering answers.
  const clear = useCallback(() => { agentSession.clear() }, [])

  return (
    <div className="sp-pane">
      <PaneSectionHeader
        title="AI Agent"
        icon="activity.agent"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        actions={
          <ButtonGroup minimal>
            <Tooltip content="Clear chat" placement="bottom" compact>
              <Button
                minimal
                small
                icon={<AppIcon name="ui.trash" aria-hidden />}
                className="section-action-btn"
                aria-label="Clear chat"
                // While a turn runs its progress would land in the empty
                // transcript it just made; Stop first.
                disabled={running || transcript.length === 0}
                onClick={clear}
              />
            </Tooltip>
          </ButtonGroup>
        }
      />
      {!collapsed && (
        <div className="agent-pane-body">
          <AgentTranscript entries={transcript} onOpenSettings={openSettings} />
          <div className="agent-composer">
            <TextAreaField
              ref={inputRef}
              value={draft}
              onChange={handleChange}
              placeholder={
                running ? 'Working...' : 'Ask for what you want to see. Up arrow for earlier prompts'
              }
              disabled={running}
              ariaLabel="Message the AI agent"
              minRows={1}
              maxRows={6}
              onSubmit={submit}
              submitKey={submitKey}
              onKeyDown={handleKeyDown}
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
