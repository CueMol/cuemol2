/**
 * @file plugins/agent/renderer/agentSessionStore.test.ts
 * @description Starting a new conversation without breaking the panel.
 *
 * Clearing has to drop both halves of the conversation -- what is on screen
 * and what the model is told -- while keeping the handlers the composer
 * sends through. The Root installs those once and only reinstalls them when
 * its callbacks change, so a clear that dropped them would leave the
 * composer dead until something unrelated re-rendered.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { agentSession, getAgentSession } from './agentSessionStore'

const runner = { send: vi.fn(), stop: vi.fn() }

beforeEach(() => {
  agentSession.reset()
  agentSession.setRunner(runner)
})

describe('clearing the chat', () => {
  it('drops the transcript and the history, and keeps the panel working', () => {
    agentSession.beginTurn('t1', 'load 1CRN')
    agentSession.endTurn([{ role: 'user', content: 'load 1CRN' }])
    expect(getAgentSession().transcript).not.toHaveLength(0)
    expect(getAgentSession().history).not.toHaveLength(0)

    agentSession.clear()

    const state = getAgentSession()
    expect(state.transcript).toEqual([])
    // The model must not keep steering answers from a conversation the user
    // just cleared.
    expect(state.history).toEqual([])
    expect(state.runner).toBe(runner)
  })

  it('is switching the plugin off that drops the runner, not clearing', () => {
    agentSession.reset()
    expect(getAgentSession().runner).toBeNull()
  })
})
