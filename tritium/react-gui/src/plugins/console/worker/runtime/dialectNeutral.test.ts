/**
 * @file plugins/console/worker/runtime/dialectNeutral.test.ts
 * @description The runtime and Tab read a line only through the dialect's syntax.
 *
 * A dialect whose grammar is not the comma one (arguments separated by
 * spaces, as ChimeraX's are) has to work without the runtime or the
 * completion service knowing it: what Tab writes back is in that grammar,
 * and running the completed line binds its arguments the same way. If the
 * comma grammar leaked back in as a default, `greet big world` would be
 * read as one argument and the run would fail.
 *
 * Also pinned: a file that is another dialect's script (by extension) is
 * refused with the one shared wording, whoever the current dialect is.
 */

import { describe, it, expect, vi } from 'vitest'
import { fakeScene, makeWorkerCtx } from '@renderer/worker/testing'
import type { ConsoleCommand, DialectLine, DialectSyntax } from './types'

const { greeted } = vi.hoisted(() => ({ greeted: [] as Record<string, string>[] }))

vi.mock('../dialects', async () => {
  const { settle } = await import('../completion/engine')
  const greet: ConsoleCommand = {
    name: 'greet',
    params: [{ name: 'how' }, { name: 'who' }],
    mode: 'strict',
    mutates: false,
    summary: 'stub',
    run: (_ctx, args) => {
      greeted.push(args)
      return { ok: true }
    },
  }
  /** Arguments separated by spaces; `@file` runs a script. */
  const syntax: DialectSyntax = {
    split: (text) =>
      text.split('\n').filter((l) => l.trim() !== '').map((l): DialectLine => {
        const t = l.trim()
        return t.startsWith('@')
          ? { text: t, display: t, quiet: false, scriptPath: t.slice(1), source: t }
          : { text: t, display: t, quiet: false, source: t }
      }),
    resolve: (text, commands) => {
      const spec = commands.find((c) => c.name === text.split(' ')[0])
      return spec ? { kind: 'found', spec } : { kind: 'error', error: 'Error: unknown' }
    },
    bind: (spec, text) => {
      const words = text.split(' ').slice(1)
      if (words.length !== spec.params.length) return { kind: 'error', error: 'Error: wrong count' }
      return { kind: 'args', args: Object.fromEntries(spec.params.map((p, i) => [p.name, words[i]])) }
    },
    complete: (_ctx, line) => {
      const at = line.lastIndexOf(' ') + 1
      const pattern = line.slice(at)
      // Values end with a space in this grammar, never `, `.
      const offers = ['world', 'wide'].filter((t) => t.startsWith(pattern)).map((t) => ({ text: t, sep: ' ', kind: 'value' as const }))
      return settle([{ heading: 'who', pattern, regionStart: at, offers, plain: true }], (n) => line.slice(0, n), true, pattern, [])
    },
  }
  return {
    registeredMetas: () => [
      { id: 'native', label: 'CueMol', scripts: [{ ext: '.qax', submit: 'path' }] },
      { id: 'pymol', label: 'PyMOL', scripts: [{ ext: '.pml', submit: 'text' }] },
    ],
    dialectOf: () => ({
      meta: { id: 'spaced', label: 'Spaced', prompt: 'Sp>', txnPrefix: 'sp: ', actionSource: 'sp', historyKey: '', scripts: [], cliColor: 'cyan' },
      syntax,
      commands: () => [greet],
      refuseScript: () => null,
      candidates: () => null,
    }),
  }
})

import { complete } from '../completion/completeService'
import { runCommand } from './runCommand'

describe('a dialect with its own grammar', () => {
  it('runs the line Tab completed, read by the same grammar', async () => {
    const { ctx } = makeWorkerCtx({ scenes: [fakeScene({ uid: 1 })] })
    const done = complete(ctx, { dialect: 'spaced', sceneId: 1, viewId: 7, line: 'greet big wor' })
    expect(done.ok && done.replacement).toBe('greet big world ')

    const line = done.ok ? (done.replacement ?? '').trim() : ''
    const res = await runCommand(ctx, { dialect: 'spaced', sceneId: 1, viewId: 7, runId: 'r', text: line })
    expect(res.ok && res.aborted).toBe(false)
    expect(greeted).toEqual([{ how: 'big', who: 'world' }])
  })

  it("refuses another dialect's script with the shared wording", async () => {
    const { ctx } = makeWorkerCtx({ scenes: [fakeScene({ uid: 1 })] })
    const res = await runCommand(ctx, { dialect: 'spaced', sceneId: 1, viewId: 7, runId: 'r', text: '@/nowhere/x.pml' })
    expect(res.ok && res.entries.at(-1)).toEqual({
      kind: 'error',
      text: 'Error: /nowhere/x.pml is a PyMOL script; switch the console to the PyMOL dialect to run it',
    })
  })
})
