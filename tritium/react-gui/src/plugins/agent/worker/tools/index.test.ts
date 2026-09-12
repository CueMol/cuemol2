/**
 * @file plugins/agent/worker/tools/index.test.ts
 * @description What the catalogue promises the API and the model.
 *
 * The schemas go out with `strict: true`, which the API rejects outright
 * unless every property is required and no extras are allowed -- a whole turn
 * fails on one malformed schema, so this checks all of them at once. The
 * order is pinned because the tool list is part of the cached prompt prefix.
 *
 * The cheat sheet is checked here too: it is a hand transcription of a
 * vocabulary that lives elsewhere (a renderer module a worker may not import,
 * and a C++-read XML), so nothing but a test connects the two.
 */

import { describe, it, expect } from 'vitest'
import { AGENT_TOOLS, OPENAI_TOOLS } from './index'
import type { StrictObjectSchema } from './types'
import { SYSTEM_PROMPT } from '../prompt/systemPrompt'
import {
  CHEAT_SHEET_KEYWORDS,
  CHEAT_SHEET_NAMED_SELECTIONS,
} from '../prompt/selectionCheatSheet'

/** OpenAI's own guidance: keep a turn under twenty functions. */
const MAX_TOOLS = 20

/** Every nested object schema, including the root. */
function schemasOf(schema: StrictObjectSchema): StrictObjectSchema[] {
  const nested = Object.values(schema.properties)
    .filter((p): p is StrictObjectSchema => (p as StrictObjectSchema)?.type === 'object')
    .flatMap(schemasOf)
  return [schema, ...nested]
}

describe('the tool catalogue', () => {
  it('names each tool once, in a stable order', () => {
    const names = AGENT_TOOLS.map((t) => t.name)
    expect(names).toEqual([...new Set(names)])
    expect(names).toEqual([...names].sort())
    expect(names.length).toBeLessThan(MAX_TOOLS)
  })

  it('declares every schema in the form strict mode requires', () => {
    for (const tool of AGENT_TOOLS) {
      for (const schema of schemasOf(tool.parameters)) {
        expect(schema.additionalProperties, tool.name).toBe(false)
        expect([...schema.required].sort(), tool.name).toEqual(
          Object.keys(schema.properties).sort(),
        )
      }
      expect(tool.description.length, tool.name).toBeGreaterThan(0)
    }
  })

  it('sends them to the API as strict function tools', () => {
    expect(OPENAI_TOOLS).toHaveLength(AGENT_TOOLS.length)
    for (const tool of OPENAI_TOOLS) {
      expect(tool.type).toBe('function')
      expect(tool.strict).toBe(true)
    }
  })
})

describe('the selection cheat sheet', () => {
  it('covers every keyword and built-in name the model may need', () => {
    for (const keyword of CHEAT_SHEET_KEYWORDS) {
      expect(SYSTEM_PROMPT, keyword).toContain(keyword)
    }
    for (const name of CHEAT_SHEET_NAMED_SELECTIONS) {
      expect(SYSTEM_PROMPT, name).toContain(name)
    }
  })
})
