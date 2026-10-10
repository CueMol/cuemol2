/**
 * @file plugins/console/worker/dialects/native/naming.test.ts
 * @description The command naming rules (docs/architecture/op-catalog.md),
 * checked where a new op or builtin would break them.
 *
 * Names were once picked one at a time and drifted (anim_list next to
 * list_cameras, make / gen / new for one meaning). An op name starts with a
 * verb from a fixed vocabulary; `help` lists every command under a subject.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

import { OPS } from '@renderer/worker/server/catalog'
import { OP_GROUPS } from '@renderer/worker/server/catalog/op'
import { NATIVE_DIALECT } from './index'

/** The verbs an op or builtin name may start with. */
const VERBS = new Set([
  // The fixed vocabulary.
  'list', 'get', 'set', 'reset', 'create', 'delete', 'add', 'remove', 'move', 'rename', 'clear',
  'apply', 'load', 'save', 'export', 'fetch', 'calc', 'recalc', 'show', 'hide',
  // Verbs of their own, which overlap none of the above.
  'superpose', 'measure', 'merge', 'cut', 'rotate', 'pan', 'focus', 'center', 'recenter',
  'analyze', 'render', 'animate', 'renumber', 'define', 'count', 'capture', 'open', 'close',
  'switch', 'run', 'log', 'undo', 'redo', 'help', 'quit', 'exit',
])

/** Builtins named after the shell, and the short form of list_scenes. */
const SHELL_NAMES = new Set(['cd', 'pwd', 'ls', 'scenes'])

describe('command names', () => {
  it('start with a verb from the vocabulary, the op names and the builtins alike', () => {
    const generated = new Set(OPS.flatMap((op) => [op.name, ...(op.aliases ?? []).map((a) => a.name)]))
    const builtins = NATIVE_DIALECT.commands().map((c) => c.name).filter((n) => !generated.has(n))
    const names = [...OPS.map((op) => op.name), ...builtins].filter((n) => !SHELL_NAMES.has(n))
    expect(names.filter((n) => !VERBS.has(n.split('_')[0]))).toEqual([])
  })

  it('are each listed by help under a subject, and no subject is a command name', () => {
    const commands = NATIVE_DIALECT.commands()
    expect(commands.filter((c) => c.group === undefined).map((c) => c.name)).toEqual([])
    const names = new Set(commands.map((c) => c.name))
    expect(Object.keys(OP_GROUPS).filter((g) => names.has(g))).toEqual([])
  })
})
