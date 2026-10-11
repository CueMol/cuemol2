/**
 * @file plugins/console/worker/dialects/native/help.test.ts
 * @description What native `help` prints, at its three levels.
 *
 * `help` alone lists only the subjects (the whole catalogue in one page was
 * too long to read). A command made from an op explains itself with the op's
 * own description and parameter descriptions -- the text the MCP server sends
 * a model -- so the console and MCP keep one source.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

import { CONSOLE_COMMAND_OPS } from '@renderer/worker/server/catalog'
import type { Param } from '@renderer/worker/server/catalog/params'
import { makeWorkerCtx } from '@renderer/worker/testing'
import type { CmdContext } from '../../runtime/types'
import { NATIVE_DIALECT } from './index'

/** `help <topic>`'s Markdown; plain output fails the test. */
function help(topic: string): string {
  const cmd = NATIVE_DIALECT.commands().find((c) => c.name === 'help')!
  const md: string[] = []
  const cc = {
    print: (t: string) => { throw new Error(`plain output: ${t}`) },
    printMarkdown: (t: string) => md.push(t),
  } as unknown as CmdContext
  const result = cmd.run(makeWorkerCtx().ctx, { command: topic }, cc)
  expect(result).toEqual({ ok: true })
  return md.join('\n')
}

describe('native help', () => {
  it('lists the subjects, not the commands; a subject lists its commands', () => {
    const index = help('')
    expect(index).toContain('`help viewing`')
    expect(index).not.toContain('set_view')
    expect(help('viewing')).toContain('`set_view`')
  })

  it("explains an op's command with the op's own text and an argument table", () => {
    const op = CONSOLE_COMMAND_OPS.find((o) =>
      Object.values(o.params as Record<string, Param<unknown>>).some((p) => p.kind === 'enum' && p.values),
    )!
    const [name, param] = Object.entries(op.params as Record<string, Param<unknown>>).find(
      ([, p]) => p.kind === 'enum' && p.values,
    )!
    const text = help(op.name)
    expect(text).toMatch(new RegExp('```\\n' + op.name + '\\b'))
    expect(text).toContain(op.description)
    const row = text.split('\n').find((l) => l.startsWith(`| \`${name}\``))!
    expect(row).toContain(`\`${param.values![0]}\``)
    expect(row).toContain(param.description.split('\n')[0].replace(/\|/g, '\\|'))
  })
})
