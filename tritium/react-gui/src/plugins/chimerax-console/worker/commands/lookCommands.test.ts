/**
 * @file plugins/chimerax-console/worker/commands/lookCommands.test.ts
 * @description `lighting` (the agreed approximation) and `preset`.
 *
 * What the scene does not show as an error: a lighting preset that is only
 * approximated passing without saying so, a preset name matched otherwise
 * than ChimeraX matches it (`preset pub` is ambiguous there), a refused
 * preset running part of its commands, and Original Look leaving the
 * surfaces a `surface` drew (ChimeraX hides them first).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '@plugins/console/worker/dialect-api'

const { log } = vi.hoisted(() => ({ log: [] as string[] }))

vi.mock('../display', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runOp: async (_ctx: unknown, _cc: unknown, name: string, args: Record<string, unknown>) => {
    log.push(name === 'set_node_prop' ? `${args.prop}=${args.value}` : name)
    return { ok: true }
  },
}))
vi.mock('./viewCommands', () => ({
  silhouettes: async (_ctx: unknown, _cc: unknown, _cmd: string, enable: string) => {
    log.push(`silhouettes ${enable}`)
    return { ok: true }
  },
}))
vi.mock('../models', () => ({
  numberedObjects: () => [{ uid: 10, model: 1, name: 'm', className: 'MolCoord' }],
  isMolecule: () => true,
}))
vi.mock('../surface', () => ({
  hideSurfaces: async () => {
    log.push('hide surfaces')
    return { ok: true }
  },
}))
vi.mock('../autoStyle', () => ({
  applyAutoStyle: async (_ctx: unknown, _cc: unknown, _obj: unknown, style?: string) => {
    log.push(`auto style ${style ?? 'by size'}`)
    return { ok: true }
  },
}))
vi.mock('./aliasCommands', () => ({
  runChxLines: async (_ctx: unknown, _cc: unknown, text: string) => {
    log.push(`run ${text}`)
    return { ok: true }
  },
}))

import { findPreset, LOOK_COMMANDS } from './lookCommands'

const ctx = {} as WorkerContext
const warn = vi.fn()
const cc = { sceneId: 1, viewId: 2, print: vi.fn(), warn } as unknown as CmdContext

/** Run a command with the given arguments, the rest at their defaults. */
async function run(name: keyof typeof LOOK_COMMANDS, given: Record<string, string>) {
  const cmd = LOOK_COMMANDS[name]
  return cmd.run(ctx, Object.fromEntries(cmd.args.map((a) => [a.name, given[a.name] ?? a.default ?? ''])), cc)
}

beforeEach(() => {
  log.length = 0
  warn.mockClear()
})

describe('lighting', () => {
  it('maps the presets onto ambient occlusion and outlines, saying what it cannot draw', async () => {
    await run('lighting', { preset: 'simple' })
    expect(log).toEqual(['aoEnabled=false'])
    expect(warn).not.toHaveBeenCalled()

    for (const [preset, ao] of [['soft', 'true'], ['full', 'true'], ['flat', 'false']]) {
      log.length = 0
      warn.mockClear()
      await run('lighting', { preset })
      expect(log[0]).toBe(`aoEnabled=${ao}`)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`lighting: ${preset} is approximated`))
    }
    expect(log).toEqual(['aoEnabled=false', 'silhouettes true'])
  })
})

describe('preset', () => {
  it('matches names as ChimeraX does', () => {
    expect(findPreset('original', '')).toEqual({ category: 'Initial Styles', name: 'Original Look' })
    expect(findPreset("'initial styles'", 'cartoon')).toEqual({ category: 'Initial Styles', name: 'Cartoon' })
    expect(findPreset('pub', '')).toMatchObject({ error: expect.stringContaining('multiple preset names match') })
    expect(findPreset('publication', '1')).toEqual({ category: 'Overall Look', name: 'publication 1 (silhouettes)' })
  })

  it('hides the surfaces before an Initial Style, and runs nothing of a refused preset', async () => {
    expect((await run('preset', { text1: 'original' })).ok).toBe(true)
    expect(log).toEqual(['hide surfaces', 'auto style by size'])

    log.length = 0
    expect((await run('preset', { text1: 'cylinders' })).ok).toBe(false)
    expect(log).toEqual([])
  })
})
