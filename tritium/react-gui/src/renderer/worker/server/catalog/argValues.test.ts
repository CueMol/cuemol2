/**
 * @file worker/server/catalog/argValues.test.ts
 * @description A JSON caller (MCP, the agent) meets the argument rules the
 * console does.
 *
 * The JSON reader once took 1.5 for an integer and turned any value but
 * `true` into false; the console refused both. Both now check with `checkArg`.
 */

import { describe, it, expect } from 'vitest'
import { defineOp } from './op'
import { boolean, integer, optional } from './params'
import { readToolArgs } from './toolSchema'

const op = defineOp({
  name: 'set_count',
  group: 'nodes',
  description: 'Test op.',
  params: { n: integer('A count.'), on: optional(boolean('A switch.')) },
  mutates: false,
  expose: { tool: false, console: true },
  run: () => ({ ok: true }),
})

describe('readToolArgs', () => {
  it('refuses what the console refuses, and reads a number or a switch sent as text', () => {
    expect(readToolArgs(op, { n: 1.5, on: null })).toBe('n must be a whole number.')
    expect(readToolArgs(op, { n: 2, on: 'maybe' })).toBe('on must be true or false.')
    expect(readToolArgs(op, { n: '2', on: 'off' })).toEqual({ n: 2, on: false })
  })
})
