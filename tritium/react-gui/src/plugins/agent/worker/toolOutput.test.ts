/**
 * @file plugins/agent/worker/toolOutput.test.ts
 * @description What a service's answer looks like by the time the model sees it.
 *
 * Two contracts. Every failure dialect has to arrive as `ok: false` WITH a
 * reason, because a model told only that something failed retries the same
 * call until the round limit stops it. And the output has to stay bounded,
 * because a service answers at whatever length the scene happens to be.
 */

import { describe, it, expect } from 'vitest'
import {
  MAX_ARRAY_ITEMS,
  MAX_OUTPUT_CHARS,
  normalizeServiceResult,
  serializeToolOutput,
} from './toolOutput'

describe('normalizing a service result', () => {
  it.each([
    ['a Result with a reason', { ok: false, error: 'scene not found', code: 'not-found' }, 'scene not found'],
    ['a bare ok flag', { ok: false }, 'fallback reason'],
    ['an empty reason', { ok: false, error: '' }, 'fallback reason'],
    ['nothing at all', null, 'fallback reason'],
  ])('reports %s as a failure the model can act on', (_label, result, expected) => {
    const outcome = normalizeServiceResult(result, 'fallback reason')
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.error).toBe(expected)
  })

  it('strips the ok flag from a success, leaving only the payload', () => {
    const outcome = normalizeServiceResult({ ok: true, count: 3 }, 'unused')
    expect(outcome).toEqual({ ok: true, data: { count: 3 } })
  })
})

describe('serializing a tool result', () => {
  it('cuts a long array and says how much it left out', () => {
    const items = Array.from({ length: MAX_ARRAY_ITEMS + 50 }, (_, i) => i)
    const text = serializeToolOutput({ ok: true, data: { items } })
    const parsed = JSON.parse(text) as { result: { items: unknown[] } }

    expect(parsed.result.items).toHaveLength(MAX_ARRAY_ITEMS + 1)
    expect(String(parsed.result.items[MAX_ARRAY_ITEMS])).toContain('50 more')
  })

  it('caps a payload that is large even after cutting', () => {
    const text = serializeToolOutput({ ok: true, data: { blob: 'x'.repeat(MAX_OUTPUT_CHARS * 2) } })
    const parsed = JSON.parse(text) as { truncated?: boolean }
    expect(parsed.truncated).toBe(true)
    expect(text.length).toBeLessThan(MAX_OUTPUT_CHARS * 2)
  })
})
