/**
 * @file plugins/console/worker/dialects/chimerax/display.test.ts
 * @description What the ChX display commands write, as ops on the console's own renderers.
 *
 * The state is the `chx:` renderers' selections and paint, nothing else, so
 * the contracts are about what is read and written there:
 *
 * - show / hide / style combine the specification into the selections, and
 *   no renderer not named `chx:` is touched;
 * - a command starts from the selection as it is now, so an undo or an edit
 *   in the GUI is where the next command starts;
 * - a colour given to atoms is in every atom renderer, so it stays when an
 *   atom changes style;
 * - a renderer is switched to per-selection paint once only, so a second
 *   `color` does not wipe the first.
 *
 * The catalog ops are faked over an in-memory molecule; what is checked is
 * the dialect's bookkeeping, not the ops.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '../../runtime/types'

interface Rend {
  id: number
  name: string
  sel: string
  paint: boolean
  entries: [string, string][]
}

const state = vi.hoisted(() => ({
  rends: [] as Rend[],
  nextId: 100,
  switched: [] as string[],
}))

vi.mock('@renderer/worker/server/catalog', () => ({
  findOp: (name: string) => ({ name }),
  invokeOp: async (op: { name: string }, _ctx: unknown, a: Record<string, unknown>) => {
    const byId = (id: unknown) => state.rends.find((r) => r.id === id) as Rend
    switch (op.name) {
      case 'create_renderer':
        state.rends.push({ id: state.nextId++, name: String(a.name), sel: String(a.selection), paint: false, entries: [] })
        break
      case 'set_renderer_selection':
        byId(a.rendId).sel = String(a.selection)
        break
      case 'set_renderer_coloring':
        byId(a.nodeId).paint = true
        byId(a.nodeId).entries = []
        state.switched.push(byId(a.nodeId).name)
        break
      case 'add_paint_at':
        byId(a.nodeId).entries.unshift([String(a.selection), String(a.color)])
        break
    }
    return { ok: true }
  },
}))
vi.mock('@renderer/worker/server/catalog/refs', () => ({
  objectNodes: () => [{ id: 1, name: '1crn', type: 'object', children: state.rends.map((r) => ({ id: r.id, name: r.name, type: 'renderer', children: [] })) }],
  rendererNodesOf: (obj: { children: unknown[] }) => obj.children,
}))
vi.mock('@renderer/worker/server/services/props/read', () => ({
  getGenericProps: (_ctx: unknown, a: { nodeId: number }) => ({
    ok: true,
    entries: [{ key: 'sel', value: state.rends.find((r) => r.id === a.nodeId)?.sel }],
  }),
}))
vi.mock('@renderer/worker/server/services/coloring/panelList', () => ({
  getRendererPaintInfo: (_ctx: unknown, a: { rendId: number }) => ({ canPaint: state.rends.find((r) => r.id === a.rendId)?.paint ?? false }),
}))
vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: () => ({ objects: [{ uid: 1, name: '1crn', className: 'MolCoord' }] }),
}))

import { CHX_COMMANDS } from './commands/registry'
import { bindLine, resolveWords } from './cli/syntax'

const ctx = {} as WorkerContext
const cc = {
  sceneId: 1, viewId: 2, cwd: '/', print: () => {}, printMarkdown: () => {}, warn: () => {}, markMutated: () => {},
  setCwd: () => {}, noteStream: () => {}, streamId: (t: string) => t, stopped: () => false,
  runScript: async () => ({ ok: true }), openScene: () => {}, requestScene: () => false,
} as unknown as CmdContext

/** Run one ChX command line against the fake molecule. */
async function chx(line: string): Promise<void> {
  const r = resolveWords(line, CHX_COMMANDS)
  if ('error' in r) throw new Error(r.error)
  const b = bindLine(r.spec, line)
  if (b.kind !== 'args') throw new Error(b.kind === 'error' ? b.error : 'usage')
  const out = await r.spec.run(ctx, b.args, cc)
  if (!out.ok) throw new Error(out.error)
}

const rend = (name: string) => state.rends.find((r) => r.name === name) as Rend

/** A few atoms to evaluate the written expressions on, rather than pin their text. */
const ATOMS = [
  { chain: 'A', resi: 3, resn: 'ALA', name: 'CA' },
  { chain: 'A', resi: 3, resn: 'ALA', name: 'CB' },
  { chain: 'A', resi: 7, resn: 'SER', name: 'CA' },
  { chain: 'A', resi: 9, resn: 'GLY', name: 'CA' },
]
type Atom = (typeof ATOMS)[number]

/**
 * The atoms a CueMol expression selects, for the subset the dialect writes:
 * and / or / not, brackets, `*`, `none`, `protein`, `ligand` (none here),
 * `resn`, `name`, `chain`, `resi a:b`.
 */
function selected(expr: string): string[] {
  const toks = expr.match(/\(|\)|[^\s()]+/g) ?? []
  let i = 0
  const term = (): (a: Atom) => boolean => {
    const t = toks[i++]
    if (t === '(') {
      const e = orExpr()
      i++
      return e
    }
    if (t === 'not') {
      const e = term()
      return (a) => !e(a)
    }
    if (t === '*' || t === 'protein') return () => true
    if (t === 'none' || t === 'ligand') return () => false
    const v = toks[i++].split(',')
    if (t === 'resn') return (a) => v.includes(a.resn)
    if (t === 'name') return (a) => v.includes(a.name)
    if (t === 'chain') return (a) => v.includes(a.chain)
    if (t === 'resi') return (a) => v.some((r) => { const [lo, hi = lo] = r.split(':').map(Number); return a.resi >= lo && a.resi <= hi })
    throw new Error(`unexpected ${t}`)
  }
  const andExpr = () => {
    let e = term()
    while (toks[i] === 'and') { i++; const l = e, r = term(); e = (a) => l(a) && r(a) }
    return e
  }
  const orExpr = () => {
    let e = andExpr()
    while (toks[i] === 'or') { i++; const l = e, r = andExpr(); e = (a) => l(a) || r(a) }
    return e
  }
  const f = orExpr()
  return ATOMS.filter(f).map((a) => `${a.resn}${a.resi}@${a.name}`)
}

describe('ChX display state', () => {
  beforeEach(() => {
    state.rends = [{ id: 1, name: 'mine', sel: 'protein', paint: false, entries: [] }]
    state.nextId = 100
    state.switched = []
  })

  it('combines show, hide, style and cartoon into the chx: selections, leaving other renderers alone', async () => {
    await chx('show :ALA atoms')
    await chx('style :ALA sphere')
    await chx('hide :ALA@CB')
    await chx('cartoon')
    await chx('cartoon hide :1-5')
    expect(selected(rend('chx:stick').sel)).toEqual([])
    expect(selected(rend('chx:sphere').sel)).toEqual(['ALA3@CA'])
    // Residues 1-5 left the cartoon; the rest of the protein stays.
    expect(selected(rend('chx:cartoon').sel)).toEqual(['SER7@CA', 'GLY9@CA'])
    expect(rend('mine').sel).toBe('protein')
  })

  it('starts from the selection as it is now (an undo, or an edit in the GUI)', async () => {
    await chx('show :ALA')
    rend('chx:stick').sel = 'resn GLY'
    await chx('show :SER')
    expect(selected(rend('chx:stick').sel)).toEqual(['SER7@CA', 'GLY9@CA'])
  })

  it('keeps a colour across a style change, and switches a renderer to paint once only', async () => {
    await chx('show :ALA')
    await chx('color /A red target a')
    await chx('color /B blue target a')
    await chx('style :ALA sphere')
    for (const name of ['chx:stick', 'chx:ball', 'chx:sphere']) {
      expect(rend(name).entries).toEqual([['chain B', '#0000ff'], ['chain A', '#ff0000']])
    }
    expect(state.switched).toEqual(['chx:stick', 'chx:ball', 'chx:sphere'])
  })
})
