/**
 * @file plugins/agent/worker/modelProvider.test.ts
 * @description What the request must NOT say about reasoning.
 *
 * The SDK picks the reasoning configuration each model actually supports --
 * adaptive thinking plus an effort where the model has one, a token budget
 * where it does not -- but only for the keys we leave unset. Filling them in
 * ourselves skips that choice, and the result is a 400 on whichever models
 * differ from the one we happened to hardcode for. Setting `thinking` to
 * adaptive is how every request to Claude Haiku 4.5 failed with "adaptive
 * thinking is not supported on this model".
 *
 * None of this is visible without making a real request, which is why it is
 * pinned here.
 */

import { describe, it, expect } from 'vitest'
import { providerOptionsFor, usesStrictTools } from './modelProvider'

describe('the per-provider request options', () => {
  it('leaves Anthropic reasoning entirely to the SDK', () => {
    const options = providerOptionsFor({ provider: 'anthropic', modelId: 'claude-haiku-4-5' })
    expect(options.anthropic?.thinking).toBeUndefined()
    expect(options.anthropic?.effort).toBeUndefined()
  })

  it('sets what OpenAI needs, but not the effort', () => {
    const options = providerOptionsFor({ provider: 'openai', modelId: 'gpt-5.6' })
    // Replaying the reasoning behind a tool call needs both of these.
    expect(options.openai?.store).toBe(false)
    expect(options.openai?.include).toEqual(['reasoning.encrypted_content'])
    // Writing this would make the SDK ignore the top-level reasoning level
    // rather than merge with it.
    expect(options.openai?.reasoningEffort).toBeUndefined()
  })

  it('asks for schema enforcement only where a catalogue this size fits', () => {
    // Anthropic compiles every strict schema into one grammar and rejects
    // the request once it is too big, which a catalogue this size is.
    expect(usesStrictTools({ provider: 'openai', modelId: 'gpt-5.6' })).toBe(true)
    expect(usesStrictTools({ provider: 'anthropic', modelId: 'claude-opus-5' })).toBe(false)
  })
})
