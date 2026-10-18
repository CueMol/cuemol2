/**
 * @file renderer/__test__/defaultActions.test.ts
 * @description The preset macros shipped in `data/default_actions.qax`: each
 * one reads, takes a parameter list the Action library can bind, and gives
 * every op arguments the op catalogue accepts. An op renamed or a parameter
 * changed in the catalogue shows up here, not as a preset that fails when a
 * user runs it.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { parseQax } from '@renderer/worker/server/actions/qax/codec'
import { bindMacroItems, macroShape } from '@renderer/worker/server/actions/qax/run'
import { qaxToInput } from '@renderer/worker/server/actions/qax/values'
import { findOp } from '@renderer/worker/server/catalog'
import { readToolArgs } from '@renderer/worker/server/catalog/toolSchema'

const FILE = path.join(__dirname, '../../../../../data/default_actions.qax')

describe('the shipped preset macros', () => {
  it('read, can be bound, and give every op arguments it accepts', () => {
    const doc = parseQax(fs.readFileSync(FILE, 'utf8'))
    if ('error' in doc) throw new Error(doc.error)
    const macros = doc.macros ?? []
    expect(macros.length).toBeGreaterThan(0)

    for (const m of macros) {
      const shape = macroShape(m)
      expect(shape.kind, m.name).not.toBe('unsupported')
      const items = bindMacroItems(m, shape.kind === 'target' ? { [m.params[0].name]: '1crn' } : {})
      if ('error' in items) throw new Error(`${m.name}: ${items.error}`)
      for (const item of items) {
        expect(item.kind, `${m.name}: only ops and notes run outside the console`).not.toBe('cmd')
        if (item.kind !== 'op') continue
        const op = findOp(item.name)
        if (!op) throw new Error(`${m.name}: no op ${item.name}`)
        const read = qaxToInput(item, op.params, () => 1)
        if (!read.ok) throw new Error(`${m.name}: ${item.name}: ${read.error}`)
        const args = readToolArgs(op, read.input)
        expect(typeof args, `${m.name}: ${item.name}: ${String(args)}`).toBe('object')
      }
    }
  })
})
