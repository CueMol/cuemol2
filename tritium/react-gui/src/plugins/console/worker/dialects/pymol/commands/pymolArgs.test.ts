/**
 * @file plugins/console/worker/dialects/pymol/commands/pymolArgs.test.ts
 * @description Arguments as PyMOL's own scripts pass them.
 *
 * A script written for PyMOL stops at the first argument the console does
 * not declare, and a positional argument in the wrong place silently means
 * something else. Pinned for the commands scripts use most.
 */

import { describe, it, expect } from 'vitest'
import { bindArgs } from '@plugins/console/worker/parser/bindArgs'
import { parseArgs } from '@plugins/console/worker/parser/parseArgs'
import { findCommand } from './registry'

function bind(line: string): Record<string, string> {
  const spec = findCommand(line.split(/\s+/)[0])
  if (!spec) throw new Error(`no command in ${line}`)
  const res = bindArgs(spec.name, spec.params, parseArgs(line, spec.mode), spec.mode)
  if (res.kind !== 'args') throw new Error('usage')
  return res.args
}

describe('PyMOL-style arguments', () => {
  it('accepts the keywords PyMOL scripts pass to fetch', () => {
    expect(bind('fetch 1ubq, async=0, quiet=1')).toMatchObject({ code: '1ubq', async: '0', quiet: '1' })
  })

  it('reads load positionally in PyMOL order: quiet is 7th, zoom 9th', () => {
    const args = bind('load f.pdb, obj, 0, pdb, 1, -1, 0, , 0')
    expect(args).toMatchObject({ object: 'obj', quiet: '0', zoom: '0' })
  })
})
