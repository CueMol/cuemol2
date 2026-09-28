/**
 * @file plugins/agent/shared/modelCatalog.test.ts
 * @description Which suggestions a provider's model list vouches for.
 *
 * The picker offers only these, so a match that is too strict hides a model
 * the key can run, and one that is too loose offers a model it cannot.
 */

import { describe, it, expect } from 'vitest'
import { availableChoices } from './modelCatalog'
import type { ModelChoice } from './modelCatalog'

const choice = (modelId: string): ModelChoice => ({
  value: `anthropic:${modelId}`,
  provider: 'anthropic',
  modelId,
  label: '',
})

describe('matching suggestions against a listed catalogue', () => {
  it('keeps exact ids and dated snapshots, nothing looser', () => {
    const choices = [choice('claude-a'), choice('claude-b'), choice('claude-opus-5'), choice('gone')]
    const listed = ['claude-a', 'claude-b-20260101', 'claude-opus-5-5', 'embedding-x']
    expect(availableChoices(choices, listed).map((c) => c.modelId)).toEqual([
      'claude-a',
      // Listed only as a dated snapshot of the alias.
      'claude-b',
      // Not claude-opus-5: `claude-opus-5-5` is a different model.
    ])
  })
})
