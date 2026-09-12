/**
 * @file plugins/agent/renderer/AgentTranscript.tsx
 * @description The conversation so far.
 *
 * Plain text, not Markdown: rendering it would mean a new dependency for a
 * panel whose answers are one to three sentences. Assistant text keeps its
 * line breaks through `white-space: pre-wrap`.
 *
 * Tool rows collapse by default. What the model passed and what came back is
 * there for when something looks wrong, and in the way the rest of the time.
 */

import React, { useEffect, useRef, useState } from 'react'
import { AppIcon, DisclosureCaret } from '@renderer/h3-kit/primitives'
import { FormButton } from '@renderer/h3-kit/form'
import type { TranscriptEntry } from './agentSessionStore'

void React

interface ToolRowProps {
  entry: Extract<TranscriptEntry, { kind: 'tool' }>
}

const ToolRow: React.FC<ToolRowProps> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false)
  const status = entry.ok === null ? 'running' : entry.ok ? 'ok' : 'error'

  return (
    <div className={`agent-tool agent-tool-${status}`}>
      <button
        type="button"
        className="agent-tool-head"
        onClick={() => { setExpanded((v) => !v) }}
        aria-expanded={expanded}
      >
        <DisclosureCaret expanded={expanded} />
        <span className="agent-tool-name">{entry.name}</span>
        <span className="agent-tool-status">
          {entry.ok === null ? 'running...' : entry.ok ? 'ok' : 'failed'}
        </span>
      </button>
      {expanded && (
        <div className="agent-tool-body">
          <div className="agent-tool-label">Input</div>
          <pre className="agent-tool-pre">{entry.input || '{}'}</pre>
          {entry.ok !== null && (
            <>
              <div className="agent-tool-label">Result</div>
              <pre className="agent-tool-pre">{entry.summary}</pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export interface AgentTranscriptProps {
  entries: readonly TranscriptEntry[]
  /** Called by the "Open Settings" button on a missing-key error. */
  onOpenSettings: () => void
}

export const AgentTranscript: React.FC<AgentTranscriptProps> = ({ entries, onOpenSettings }) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Pin to the bottom as the answer streams in, the same way the log panel
  // does. No "user scrolled up" detection: the panel is short and a turn
  // appends continuously.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo(0, el.scrollHeight)
  }, [entries])

  return (
    <div className="agent-transcript" ref={scrollRef}>
      {entries.length === 0 && (
        <div className="agent-empty">
          <AppIcon name="activity.agent" size={24} aria-hidden />
          <p className="agent-empty-text">
            Describe what you want to see. For example: load 1CRN and show it as a cartoon.
          </p>
        </div>
      )}
      {entries.map((entry) => {
        switch (entry.kind) {
          case 'user':
            return (
              <div key={entry.id} className="agent-msg agent-msg-user">
                {entry.text}
              </div>
            )
          case 'assistant':
            return (
              <div key={entry.id} className="agent-msg agent-msg-assistant">
                {entry.text}
                {entry.streaming && <span className="agent-caret" aria-hidden />}
              </div>
            )
          case 'tool':
            return <ToolRow key={entry.id} entry={entry} />
          case 'error':
            return (
              <div key={entry.id} className="agent-msg agent-msg-error">
                {entry.text}
                {entry.needsApiKey && (
                  <div className="agent-error-action">
                    <FormButton text="Open Settings" onClick={onOpenSettings} />
                  </div>
                )}
              </div>
            )
          case 'notice':
            return (
              <div key={entry.id} className="agent-msg agent-msg-notice">
                {entry.text}
              </div>
            )
        }
      })}
    </div>
  )
}
AgentTranscript.displayName = 'AgentTranscript'
