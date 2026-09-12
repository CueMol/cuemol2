/**
 * @file plugins/agent/renderer/agentSessionStore.ts
 * @description The conversation, held outside React's tree.
 *
 * A module singleton rather than a context, because the two halves of this
 * plugin are mounted in sibling subtrees: the Root (which runs the turn) is a
 * child of `PluginRoots`, and the chat pane is a child of `SidePanel`, so
 * nothing either of them provides is visible to the other. A side pane also
 * unmounts whenever the user switches activity view, which would take the
 * conversation with it.
 *
 * State lives for as long as the plugin is enabled. Switching the plugin off
 * unmounts the Root, which resets this.
 */

import { useSyncExternalStore } from 'react'
import type { AgentInputItem, AgentProgressUpdate } from '../shared/agentTypes'

/** One line of the transcript. */
export type TranscriptEntry =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | {
      kind: 'tool'
      id: string
      /** The call id, so a result can find the call it belongs to. */
      callId: string
      name: string
      input: string
      /** Null until the tool has answered. */
      ok: boolean | null
      summary: string
    }
  | { kind: 'error'; id: string; text: string; /** Offer a way to set the key. */ needsApiKey?: boolean }
  | { kind: 'notice'; id: string; text: string }

/** What the panel can ask the runner to do. Registered by the Root. */
export interface AgentRunner {
  send: (text: string) => void
  stop: () => void
}

export interface AgentSessionState {
  transcript: TranscriptEntry[]
  /** The OpenAI items replayed on the next turn. */
  history: AgentInputItem[]
  running: boolean
  /** The turn in flight, or null. */
  turnId: string | null
  runner: AgentRunner | null
}

const INITIAL: AgentSessionState = {
  transcript: [],
  history: [],
  running: false,
  turnId: null,
  runner: null,
}

let state: AgentSessionState = INITIAL
const listeners = new Set<() => void>()

function setState(next: AgentSessionState): void {
  state = next
  for (const listener of listeners) listener()
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

/** Read the whole session. Re-renders the caller on every change. */
export function useAgentSession(): AgentSessionState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}

/** Read without subscribing, for a callback that only needs the latest value. */
export function getAgentSession(): AgentSessionState {
  return state
}

export const agentSession = {
  /** Register the Root's handlers so the pane can reach them. */
  setRunner(runner: AgentRunner | null): void {
    setState({ ...state, runner })
  },

  /** Begin a turn: show what the user said and lock the composer. */
  beginTurn(turnId: string, text: string): void {
    setState({
      ...state,
      running: true,
      turnId,
      transcript: [...state.transcript, { kind: 'user', id: nextId('user'), text }],
    })
  },

  /** Fold one progress update into the transcript. */
  applyProgress(update: AgentProgressUpdate): void {
    if (update.turnId !== state.turnId) return
    switch (update.kind) {
      case 'status':
        break
      case 'text_delta': {
        const last = state.transcript[state.transcript.length - 1]
        if (last?.kind === 'assistant' && last.streaming) {
          const transcript = state.transcript.slice(0, -1)
          transcript.push({ ...last, text: last.text + update.delta })
          setState({ ...state, transcript })
        } else {
          setState({
            ...state,
            transcript: [
              ...state.transcript,
              { kind: 'assistant', id: nextId('asst'), text: update.delta, streaming: true },
            ],
          })
        }
        break
      }
      case 'tool_call':
        setState({
          ...state,
          transcript: [
            ...state.transcript,
            {
              kind: 'tool',
              id: nextId('tool'),
              callId: update.callId,
              name: update.name,
              input: update.input,
              ok: null,
              summary: '',
            },
          ],
        })
        break
      case 'tool_result': {
        const transcript = state.transcript.map((entry) =>
          entry.kind === 'tool' && entry.callId === update.callId && entry.ok === null
            ? { ...entry, ok: update.ok, summary: update.summary }
            : entry,
        )
        setState({ ...state, transcript })
        break
      }
    }
  },

  /** A turn finished: stop streaming, keep what the model produced. */
  endTurn(history: AgentInputItem[]): void {
    setState({
      ...state,
      running: false,
      turnId: null,
      history,
      transcript: state.transcript.map((entry) =>
        entry.kind === 'assistant' && entry.streaming ? { ...entry, streaming: false } : entry,
      ),
    })
  },

  /** A turn failed. The items it produced are dropped, not appended. */
  failTurn(message: string, opts: { needsApiKey?: boolean } = {}): void {
    setState({
      ...state,
      running: false,
      turnId: null,
      transcript: [
        ...state.transcript.map((entry) =>
          entry.kind === 'assistant' && entry.streaming ? { ...entry, streaming: false } : entry,
        ),
        { kind: 'error', id: nextId('err'), text: message, ...opts },
      ],
    })
  },

  /** A turn was stopped by the user. */
  cancelTurn(): void {
    setState({
      ...state,
      running: false,
      turnId: null,
      transcript: [
        ...state.transcript.map((entry) =>
          entry.kind === 'assistant' && entry.streaming ? { ...entry, streaming: false } : entry,
        ),
        { kind: 'notice', id: nextId('note'), text: 'Stopped.' },
      ],
    })
  },

  /** Add a standalone note, for something that happened outside a turn. */
  notice(text: string): void {
    setState({
      ...state,
      transcript: [...state.transcript, { kind: 'notice', id: nextId('note'), text }],
    })
  },

  /** Forget everything. Called when the plugin is switched off. */
  reset(): void {
    setState(INITIAL)
  },
}
