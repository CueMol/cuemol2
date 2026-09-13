/**
 * @file plugins/pymconsole/worker/runCommand.test.ts
 * @description What one submission does to the undo stack.
 *
 * This is the contract a user feels and cannot see: Cmd+Z after a console
 * line has to take back that line, all of it and nothing else. Both halves
 * are easy to get wrong in a way nothing else would catch -- committing a
 * read-only line silently destroys the redo stack, and rolling back a failed
 * line reverts edits already on screen.
 *
 * The commands are stubbed: what is being checked is the runner's bookkeeping,
 * not what any particular command calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeScene, makeWorkerCtx } from '@renderer/worker/testing'
import type { PymCommand } from './commands/types'

const mutating: PymCommand = {
  name: 'mutate',
  params: [],
  mode: 'strict',
  mutates: true,
  summary: 'stub',
  run: () => ({ ok: true }),
}

const readOnly: PymCommand = {
  name: 'readonly',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: 'stub',
  run: (_ctx, _args, cc) => {
    cc.print('read')
    return { ok: true }
  },
}

const failing: PymCommand = {
  name: 'boom',
  params: [],
  mode: 'strict',
  mutates: true,
  summary: 'stub',
  run: () => ({ ok: false, error: 'Error: boom' }),
}

const STUBS = [mutating, readOnly, failing]

vi.mock('./commands/registry', () => ({
  PYM_COMMANDS: [],
  commandNames: () => STUBS.map((c) => c.name),
  findCommand: (name: string) => STUBS.find((c) => c.name === name),
}))

import { runCommand } from './runCommand'

function setup() {
  const scene = fakeScene({ uid: 1 })
  const { ctx } = makeWorkerCtx({ scenes: [scene] })
  return { scene, ctx }
}

describe('runCommand', () => {
  beforeEach(() => vi.clearAllMocks())

  it('commits once for a whole submission that changed the scene', async () => {
    const { scene, ctx } = setup()
    const res = await runCommand(ctx, { sceneId: 1, viewId: 7, text: 'mutate; mutate' })
    expect(res.ok).toBe(true)
    expect(scene.undo.started).toHaveLength(1)
    expect(scene.undo.committed).toHaveLength(1)
    expect(scene.undo.rolledBack).toHaveLength(0)
  })

  it('rolls back a read-only submission, so the redo stack survives', async () => {
    const { scene, ctx } = setup()
    await runCommand(ctx, { sceneId: 1, viewId: 7, text: 'readonly' })
    expect(scene.undo.committed).toHaveLength(0)
    expect(scene.undo.rolledBack).toHaveLength(1)
  })

  it('stops at a failure but keeps what already changed', async () => {
    const { scene, ctx } = setup()
    const res = await runCommand(ctx, { sceneId: 1, viewId: 7, text: 'mutate; boom; mutate' })
    expect(res.ok && res.aborted).toBe(true)
    // The third command never ran: two echoes, not three.
    const echoes = res.ok ? res.entries.filter((e) => e.kind === 'echo') : []
    expect(echoes.map((e) => e.text)).toEqual(['PyM> mutate', 'PyM> boom'])
    expect(scene.undo.committed).toHaveLength(1)
  })

  it('reports an unknown command without touching the scene', async () => {
    const { scene, ctx } = setup()
    const res = await runCommand(ctx, { sceneId: 1, viewId: 7, text: 'nosuch' })
    expect(res.ok).toBe(true)
    const errors = res.ok ? res.entries.filter((e) => e.kind === 'error') : []
    expect(errors[0]?.text).toContain('unknown command')
    expect(scene.undo.committed).toHaveLength(0)
  })
})
