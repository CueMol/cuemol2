/**
 * @file plugins/agent/shared/modelSpec.test.ts
 * @description Which provider a setting names, and what crosses between them.
 *
 * Two rules that are invisible until they bite. A model id stored before this
 * plugin had two providers has no prefix, and reading it as anything but
 * OpenAI would break that installation on upgrade. And a reasoning part
 * carries state only its own provider can read, so it has to be dropped on
 * the way to the other one -- keeping it risks a rejected turn, and dropping
 * too much would throw away the answers along with the thinking.
 */

import { describe, it, expect } from 'vitest'
import type { ModelMessage } from 'ai'
import { parseModelSpec, sanitizeHistory } from './modelSpec'

describe('reading the model setting', () => {
  it.each([
    ['anthropic:claude-opus-5', 'anthropic', 'claude-opus-5'],
    ['openai:gpt-5.6', 'openai', 'gpt-5.6'],
    // No prefix: what an installation stored before there were two providers.
    ['gpt-5.6', 'openai', 'gpt-5.6'],
    // A colon inside the id itself still splits on the first one only.
    ['openai:ft:gpt-5.6:acme', 'openai', 'ft:gpt-5.6:acme'],
  ])('reads %s as %s', (raw, provider, modelId) => {
    expect(parseModelSpec(raw)).toEqual({ provider, modelId })
  })

  it.each([
    ['gemini:pro', 'not a known provider'],
    ['anthropic:', 'No model named'],
    ['   ', 'No model is set'],
  ])('rejects %s with something to act on', (raw, fragment) => {
    const result = parseModelSpec(raw)
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain(fragment)
  })
})

describe('sending a conversation to the other provider', () => {
  const openaiReasoning: ModelMessage = {
    role: 'assistant',
    content: [
      { type: 'reasoning', text: '', providerOptions: { openai: { itemId: 'rs_1' } } },
      { type: 'text', text: 'Loaded 1CRN.' },
      { type: 'tool-call', toolCallId: 'c1', toolName: 'fetch_pdb', input: { pdbId: '1crn' } },
    ],
  }

  it('drops the other provider reasoning and keeps everything visible', () => {
    const [message] = sanitizeHistory([openaiReasoning], 'anthropic')

    expect(Array.isArray(message.content)).toBe(true)
    const parts = message.content as { type: string }[]
    expect(parts.map((p) => p.type)).toEqual(['text', 'tool-call'])
  })

  it('leaves a conversation alone when it goes back to its own provider', () => {
    const history = [openaiReasoning]
    // Same array identity: nothing was rebuilt, so nothing can have been lost.
    expect(sanitizeHistory(history, 'openai')[0]).toBe(openaiReasoning)
  })

  it('leaves user and tool messages untouched', () => {
    const history: ModelMessage[] = [
      { role: 'user', content: 'load 1CRN' },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'fetch_pdb', output: { type: 'text', value: '{"ok":true}' } }] },
    ]
    expect(sanitizeHistory(history, 'anthropic')).toEqual(history)
  })
})
