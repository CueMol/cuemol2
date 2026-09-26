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

/** Waits on a download until the test lets it go, as `fetch` does. */
let releaseDownload: () => void = () => undefined
let downloadReqId = ''
const downloading: PymCommand = {
  name: 'download',
  params: [],
  mode: 'strict',
  mutates: true,
  summary: 'stub',
  run: async (_ctx, _args, cc) => {
    downloadReqId = cc.streamId('dl')
    cc.noteStream(downloadReqId)
    await new Promise<void>((resolve) => { releaseDownload = resolve })
    return { ok: false, error: 'download canceled' }
  },
}

const STUBS = [mutating, readOnly, failing, downloading]

vi.mock('@renderer/worker/server/services/helpers/streamFetchToReader', () => ({
  cancelStream: vi.fn(() => true),
}))

vi.mock('./commands/registry', () => ({
  PYM_COMMANDS: [],
  commandNames: () => STUBS.map((c) => c.name),
  findCommand: (name: string) => STUBS.find((c) => c.name === name),
}))

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { cancelStream } from '@renderer/worker/server/services/helpers/streamFetchToReader'
import { runCommand } from './runCommand'
import { cancelRun } from './runControl'

function setup() {
  const scene = fakeScene({ uid: 1 })
  const { ctx } = makeWorkerCtx({ scenes: [scene] })
  return { scene, ctx }
}

describe('runCommand', () => {
  beforeEach(() => vi.clearAllMocks())

  it('commits once for a whole submission that changed the scene', async () => {
    const { scene, ctx } = setup()
    const res = await runCommand(ctx, { sceneId: 1, viewId: 7, runId: 'r1', text: 'mutate; mutate' })
    expect(res.ok).toBe(true)
    expect(scene.undo.started).toHaveLength(1)
    expect(scene.undo.committed).toHaveLength(1)
    expect(scene.undo.rolledBack).toHaveLength(0)
  })

  it('rolls back a read-only submission, so the redo stack survives', async () => {
    const { scene, ctx } = setup()
    await runCommand(ctx, { sceneId: 1, viewId: 7, runId: 'r1', text: 'readonly' })
    expect(scene.undo.committed).toHaveLength(0)
    expect(scene.undo.rolledBack).toHaveLength(1)
  })

  it('stops at a failure but keeps what already changed', async () => {
    const { scene, ctx } = setup()
    const res = await runCommand(ctx, { sceneId: 1, viewId: 7, runId: 'r1', text: 'mutate; boom; mutate' })
    expect(res.ok && res.aborted).toBe(true)
    // The third command never ran: two echoes, not three.
    const echoes = res.ok ? res.entries.filter((e) => e.kind === 'echo') : []
    expect(echoes.map((e) => e.text)).toEqual(['PyM> mutate', 'PyM> boom'])
    expect(scene.undo.committed).toHaveLength(1)
  })

  it('reports an unknown command without touching the scene', async () => {
    const { scene, ctx } = setup()
    const res = await runCommand(ctx, { sceneId: 1, viewId: 7, runId: 'r1', text: 'nosuch' })
    expect(res.ok).toBe(true)
    const errors = res.ok ? res.entries.filter((e) => e.kind === 'error') : []
    expect(errors[0]?.text).toContain('unknown command')
    expect(scene.undo.committed).toHaveLength(0)
  })

  it('runs a script, nested scripts included, as one transaction, and stops a script that runs itself', async () => {
    const { scene, ctx } = setup()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymc-'))
    const inner = path.join(dir, 'inner.pml')
    const outer = path.join(dir, 'outer.pml')
    const self = path.join(dir, 'self.pml')
    fs.writeFileSync(inner, 'mutate\n')
    fs.writeFileSync(outer, `# comment\nmutate\n@${inner}\n`)
    fs.writeFileSync(self, `@${self}\n`)

    const res = await runCommand(ctx, { sceneId: 1, viewId: 7, runId: 'r2', text: `@${outer}` })
    expect(res.ok && !res.aborted).toBe(true)
    // One Cmd+Z takes back the whole script.
    expect(scene.undo.started).toHaveLength(1)
    expect(scene.undo.committed).toHaveLength(1)

    const looped = await runCommand(ctx, { sceneId: 1, viewId: 7, runId: 'r3', text: `@${self}` })
    const errors = looped.ok ? looped.entries.filter((e) => e.kind === 'error') : []
    expect(errors.map((e) => e.text).join()).toContain('nested more than')
  })

  it('stops on Stop: cancels the download it is waiting on and runs nothing after it', async () => {
    const { scene, ctx } = setup()
    const pending = runCommand(ctx, { sceneId: 1, viewId: 7, runId: 'r4', text: 'mutate; download; mutate' })
    await vi.waitFor(() => { expect(downloadReqId).not.toBe('') })

    cancelRun(ctx, { runId: 'r4' })
    expect(cancelStream).toHaveBeenCalledWith(downloadReqId)
    releaseDownload()

    const res = await pending
    expect(res.ok && res.interrupted).toBe(true)
    const echoes = res.ok ? res.entries.filter((e) => e.kind === 'echo') : []
    expect(echoes).toHaveLength(2)
    // The first mutate already ran, so it is kept.
    expect(scene.undo.committed).toHaveLength(1)
  })
})
