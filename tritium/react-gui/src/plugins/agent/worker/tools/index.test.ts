/**
 * @file plugins/agent/worker/tools/index.test.ts
 * @description What the catalogue promises the API and the model.
 *
 * The schemas go out with `strict: true`, which the provider rejects outright
 * unless every property is required and no extras are allowed -- a whole turn
 * fails on one malformed schema, so this checks all of them at once. The
 * order is pinned because the tool list is part of the cached prompt prefix.
 *
 * The cheat sheet is checked here too: it is a hand transcription of a
 * vocabulary that lives elsewhere (a renderer module a worker may not import,
 * and a C++-read XML), so nothing but a test connects the two.
 */

import { describe, it, expect } from 'vitest'
import { AGENT_TOOLS, buildAiSdkTools } from './index'
import type { StrictObjectSchema } from './types'
import { SYSTEM_PROMPT } from '../prompt/systemPrompt'
import {
  CHEAT_SHEET_KEYWORDS,
  CHEAT_SHEET_NAMED_SELECTIONS,
} from '../prompt/selectionCheatSheet'

/**
 * The JSON Schema keywords every provider's strict mode accepts.
 *
 * The intersection, not a preference: Anthropic's strict schemas reject
 * numeric and string constraints outright, and bound an array only at 0 or 1
 * items, so anything outside this set fails the whole request with a 400 --
 * for every tool, not just the one that used it. That is how `minItems: 2`
 * on measure_geometry broke Anthropic while OpenAI ran fine.
 *
 * Adding one here means checking it against every provider first.
 */
const ALLOWED_SCHEMA_KEYWORDS = new Set([
  'type',
  'description',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
])

/**
 * The ceiling OpenAI's guidance puts on one turn's function list.
 *
 * A soft limit about selection accuracy rather than an API one -- past it a
 * model starts picking the wrong tool -- and the catalogue now sits exactly
 * on it. The next capability has to fold something first. The obvious
 * candidate is `center_view`, which already sets the molecule's selection as
 * a documented side effect and could become an argument of
 * `set_mol_selection` rather than a tool of its own.
 */
const MAX_TOOLS = 20

/**
 * Every object schema reachable from the root, including the ones inside
 * array items -- strict mode applies to those the same way, and an argument
 * that takes a list of objects is exactly where it is easy to forget.
 */
function schemasOf(node: unknown): StrictObjectSchema[] {
  const n = node as { type?: string; properties?: Record<string, unknown>; items?: unknown }
  if (n?.type === 'object' && n.properties) {
    const nested = Object.values(n.properties).flatMap(schemasOf)
    return [n as StrictObjectSchema, ...nested]
  }
  if (n?.type === 'array' && n.items) return schemasOf(n.items)
  return []
}

describe('the tool catalogue', () => {
  it('names each tool once, in a stable order', () => {
    const names = AGENT_TOOLS.map((t) => t.name)
    expect(names).toEqual([...new Set(names)])
    expect(names).toEqual([...names].sort())
    expect(names.length).toBeLessThanOrEqual(MAX_TOOLS)
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

  it('uses only schema keywords every provider accepts', () => {
    // Walk every schema node, not just the roots: an unsupported keyword
    // anywhere in the tool list fails the request for all of them.
    const walk = (node: unknown, where: string): void => {
      if (!node || typeof node !== 'object') return
      const n = node as Record<string, unknown>
      for (const key of Object.keys(n)) {
        expect(ALLOWED_SCHEMA_KEYWORDS.has(key), `${where}: ${key}`).toBe(true)
      }
      if (n.properties && typeof n.properties === 'object') {
        for (const [name, child] of Object.entries(n.properties)) walk(child, `${where}.${name}`)
      }
      if (n.items) walk(n.items, `${where}[]`)
    }
    for (const tool of AGENT_TOOLS) walk(tool.parameters, tool.name)
  })

  it('hands the whole catalogue to the model, strict or not', () => {
    // The adapter is where a tool could silently go missing between the
    // catalogue and what the provider is offered.
    for (const strict of [true, false]) {
      const built = buildAiSdkTools(AGENT_TOOLS, {} as never, {} as never, strict)
      expect(Object.keys(built).sort()).toEqual(AGENT_TOOLS.map((t) => t.name).sort())
      for (const [name, tool] of Object.entries(built)) {
        // All or nothing: one provider refuses a catalogue this size when
        // any of it is strict, so the flag cannot vary tool by tool.
        expect((tool as { strict?: boolean }).strict, name).toBe(strict)
      }
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
