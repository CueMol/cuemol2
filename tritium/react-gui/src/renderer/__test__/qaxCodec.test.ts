/**
 * @file renderer/__test__/qaxCodec.test.ts
 * @description The qax file format (CueMol actions, XML), version 1.
 *
 * `fixtures/qax/v1.qax` is the golden file: every element and attribute the
 * format has, with escaping. A later reader / writer (the C++ one the format
 * is meant to move to) can be checked against the same file.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { parseQax, writeQax } from '@renderer/worker/server/actions/qax/codec'
import { opToQax, qaxToInput } from '@renderer/worker/server/actions/qax/values'
import type { QaxDoc } from '@renderer/worker/server/actions/qax/model'
import { readToolArgs } from '@renderer/worker/server/catalog/toolSchema'
import type { AnyOp } from '@renderer/worker/server/catalog/op'
import type { ParamMap } from '@renderer/worker/server/catalog/params'

const GOLDEN = fs.readFileSync(path.join(__dirname, 'fixtures/qax/v1.qax'), 'utf8')

const param = (kind: string, extra: Record<string, unknown> = {}) => ({ kind, description: '', optional: true, ...extra })

/** One parameter of every kind, and a node reference. */
const PARAMS = {
  flag: param('boolean'),
  count: param('integer'),
  scale: param('real'),
  text: param('string'),
  mode: param('enum', { values: ['a', 'b'] }),
  center: param('vec3'),
  atoms: param('atoms'),
  target: param('integer', { semantic: 'renderer' }),
  unset: param('string'),
} as unknown as ParamMap

describe('qax', () => {
  it('reads and writes the golden file back to the same text', () => {
    const doc = parseQax(GOLDEN)
    if ('error' in doc) throw new Error(doc.error)
    expect(doc.actions).toHaveLength(4)
    expect(doc.actions[1].label).toBe('cmd: measure "a" & <b>')
    expect(doc.actions[1].items[3]).toEqual({ kind: 'op', name: 'delete_node', args: [{ name: 'nodeId', uid: 31 }] })
    expect(doc.macros?.map((m) => m.name)).toEqual(['cartoon-hide', 'white-bg'])
    expect(doc.macros?.[0].params).toEqual([{ name: 'target', type: 'MolCoord', label: 'Target' }])
    const sub = doc.macros?.[0].items[1]
    expect(sub?.kind === 'op' && sub.args[0]).toEqual({ name: 'nodeId', param: 'target', sub: 'p_cartoon' })
    expect(writeQax(doc)).toBe(GOLDEN)
  })

  it('carries typed arguments through the file to what readToolArgs reads', () => {
    const args = {
      flag: false,
      count: 3,
      scale: 0.25,
      text: ' "x", \'y\' <z> ',
      mode: 'b',
      center: [1, -2.5, 0],
      atoms: [{ chain: 'A', resid: '7', atomName: 'CA' }],
      target: 12,
      unset: null,
    }
    const item = opToQax('probe', PARAMS, args, { target: '1crn/cartoon1' })
    const doc = parseQax(writeQax({ version: 1, actions: [{ items: [item] }] })) as QaxDoc
    const back = doc.actions[0].items[0]
    if (back.kind !== 'op') throw new Error('not an op')

    // The path is looked up; the uid written beside it is only a hint.
    const read = qaxToInput(back, PARAMS, (ref) => (ref.path === '1crn/cartoon1' ? 40 : { error: 'no' }))
    if (!read.ok) throw new Error(read.error)
    const typed = readToolArgs({ name: 'probe', params: PARAMS } as unknown as AnyOp, read.input)
    expect(typed).toEqual({ ...args, target: 40 })
  })

  it('refuses another version, a param no macro declares, and a macro defined twice', () => {
    const v1 = (body: string) => parseQax(`<cuemol-actions version="1">${body}</cuemol-actions>`)
    const useP = '<op name="x"><arg name="objId" param="p"/></op>'
    expect(parseQax('<cuemol-actions version="2"/>')).toEqual({ error: expect.stringContaining('version 2') })
    expect(v1(`<macro name="m">${useP}</macro>`)).toEqual({ error: expect.stringContaining('no param "p"') })
    expect(v1(`<action>${useP}</action>`)).toEqual({ error: expect.stringContaining('only allowed in a <macro>') })
    expect(v1('<macro name="m"/><macro name="m"/>')).toEqual({ error: expect.stringContaining('defined twice') })
    expect(parseQax('<cuemol-actions version="1"><action>')).toEqual({ error: expect.stringContaining('well-formed') })
  })
})
