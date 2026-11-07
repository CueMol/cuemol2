/**
 * @file plugins/chimerax-console/worker/commands/selectCommands.ts
 * @description `select` (with `add` / `subtract` / `intersect` / `clear`,
 * `~select`), `name` (with `delete` / `list`), and `info` (with `models` /
 * `chains` / `residues` / `atoms`).
 *
 * ChimeraX's selection is each molecule's own selection here (the
 * `set_mol_selection` op), and `sel` in a specification reads it back.
 * `select` replaces it: the molecules the specification does not reach are
 * cleared. The combining forms read the current selection and write the
 * union, difference or intersection (`display.ts`).
 *
 * `name` keeps a named selection in the scene (`define_selection`), as one
 * CueMol expression. CueMol evaluates it in whichever molecule uses it, so
 * a specification whose meaning differs between models (`#1/A`) cannot be
 * named.
 *
 * None of these is `mutates`: the ops they run say whether anything
 * changed, so a `select` that changes nothing leaves the redo stack alone.
 */

import type { CmdOutcome, CmdContext } from '@plugins/console/worker/dialect-api'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { BoolArg, FloatArg, RestOfLine, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { emitContext, forEachAtom, intersect, minus, readSpec, runOp, targetsOf, targetsOfNode, union } from '../display'
import type { AtomView, Target } from '../display'
import { isMolecule, numberedObjects } from '../models'
import type { NumberedObject } from '../models'
import { ALL, NONE } from '../spec/emit'
import type { SpecNode } from '../spec/parse'
import { namedSelections } from '../names'
import { warnIgnored } from './warn'

// --- select ---

/** A molecule's current selection, as an expression (`none` for none). */
function currentSel(ctx: WorkerContext, sceneId: number, uid: number): string {
  const props = getGenericProps(ctx, { sceneId, nodeId: uid, nodeType: 'object' })
  const v = props.ok ? props.entries.find((e) => e.key === 'sel')?.value : undefined
  const text = v === null || v === undefined ? '' : String(v).trim()
  return text === '' ? NONE : text
}

/** How a `select` form combines the spec with what is selected now. */
type Combine = 'replace' | 'add' | 'subtract' | 'intersect'

/**
 * Write each molecule's new selection, and say how many atoms are selected.
 *
 * @param spec - '' is everything for `replace` / `add`, nothing for `subtract`
 */
async function applySelect(
  ctx: WorkerContext,
  cc: CmdContext,
  combine: Combine,
  spec: string,
  residues: boolean,
): Promise<CmdOutcome> {
  const mols = numberedObjects(ctx, cc.sceneId).filter(isMolecule)
  let targets: Target[] = []
  if (!(combine === 'subtract' && spec.trim() === '')) {
    const found = targetsOf(ctx, cc.sceneId, spec)
    if (!found.ok) return found
    targets = found.targets
  }
  const next = new Map<number, string>()
  for (const obj of mols) {
    let term = targets.find((t) => t.obj.uid === obj.uid)?.sel ?? NONE
    if (combine === 'subtract' && spec.trim() === '') term = ALL
    if (residues && term !== NONE && term !== ALL) term = `byres (${term})`
    const now = currentSel(ctx, cc.sceneId, obj.uid)
    next.set(obj.uid,
      combine === 'replace' ? term
      : combine === 'add' ? union(now, term)
      : combine === 'subtract' ? minus(now, term)
      : intersect(now, term))
  }
  return writeSelections(ctx, cc, next)
}

/**
 * Write each molecule's new selection (`next`, by object uid; a molecule not
 * in it keeps its own), and say how many atoms are selected.
 */
async function writeSelections(ctx: WorkerContext, cc: CmdContext, next: ReadonlyMap<number, string>): Promise<CmdOutcome> {
  let total = 0
  for (const obj of numberedObjects(ctx, cc.sceneId).filter(isMolecule)) {
    const now = currentSel(ctx, cc.sceneId, obj.uid)
    const sel = next.get(obj.uid) ?? now
    if (sel !== now) {
      const res = await runOp(ctx, cc, 'set_mol_selection', { objId: obj.uid, selection: sel === NONE ? '' : sel })
      if (!res.ok) return res
    }
    if (sel !== NONE) {
      const counted = await runOp(ctx, cc, 'count_selection', { objId: obj.uid, selection: sel })
      if (counted.ok) total += (counted.data as { atomCount?: number }).atomCount ?? 0
    }
  }
  cc.print(total === 0 ? 'Nothing selected' : `${total} atoms selected`)
  return { ok: true }
}

// --- select zone ---

/** Every atom of every model, as a specification tree. */
const EVERYTHING: SpecNode = { kind: 'hier', models: null, modelTests: null, chains: [] }

/**
 * `select zone near range [find] [extend] [residues]`, in the order
 * ChimeraX's `zone_items` takes (`zonesel.py`): the targets less the
 * reference atoms, those within `range` of them atom by atom, then the
 * reference atoms added back (`extend`), and only last whole residues
 * (`residues`). Widening to residues before the distance test would keep
 * only the target atoms of a residue (`@CB` stays CB alone).
 */
const selectZone = chxCommand({
  words: ['select', 'zone'],
  args: [
    { name: 'near', type: SpecArg, role: 'required' },
    { name: 'range', type: FloatArg, role: 'required' },
    { name: 'find', type: SpecArg, role: 'optional' },
    { name: 'extend', type: BoolArg, role: 'keyword' },
    { name: 'residues', type: BoolArg, role: 'keyword' },
  ],
  mutates: false,
  summary: 'Select the atoms within a distance of others (whole residues with residues true).',
  async run(ctx, args, cc) {
    const near = readSpec(ctx, cc.sceneId, args.near)
    if (!near.ok) return near
    const nearAt = targetsOfNode(ctx, cc.sceneId, near.node, args.near)
    if (!nearAt.ok) return nearAt
    if (nearAt.targets.every((t) => !emitContext(ctx, cc.sceneId).anyHit(t.obj.model, t.sel))) {
      return { ok: false, error: 'Error: select zone: no atoms specified' }
    }
    let find: SpecNode = EVERYTHING
    if (args.find.trim() !== '') {
      const read = readSpec(ctx, cc.sceneId, args.find)
      if (!read.ok) return read
      find = read.node
    }
    const zone: SpecNode = { kind: 'zone', term: near.node, level: '@', op: '<', dist: Number(args.range), pos: 0 }
    let node: SpecNode = { kind: 'and', left: { kind: 'and', left: find, right: { kind: 'not', term: near.node } }, right: zone }
    if (args.extend === 'true') node = { kind: 'or', left: node, right: near.node }
    const found = targetsOfNode(ctx, cc.sceneId, node, `${args.near} ${args.find}`.trim())
    if (!found.ok) return found
    const next = new Map<number, string>()
    for (const obj of numberedObjects(ctx, cc.sceneId).filter(isMolecule)) {
      const sel = found.targets.find((t) => t.obj.uid === obj.uid)?.sel ?? NONE
      next.set(obj.uid, args.residues === 'true' && sel !== NONE && sel !== ALL ? `byres (${sel})` : sel)
    }
    return writeSelections(ctx, cc, next)
  },
})

// --- select up / down ---

/** One `select up`: each molecule's selection before and after it. */
interface Promotion {
  before: Map<number, string>
  after: Map<number, string>
}

/**
 * The `select up` steps of each scene, so `select down` can go back.
 * Worker memory, as the model numbers are: not scene state, not undone.
 */
const promotions = new Map<number, Promotion[]>()

/** How many atoms `expr` matches in molecule `uid`. */
function countAtoms(ctx: WorkerContext, sceneId: number, uid: number, expr: string): number {
  let n = 0
  forEachAtom(ctx, sceneId, uid, expr, () => { n++ })
  return n
}

/**
 * The next larger group around a molecule's selection (residues, then
 * chains, then the molecule), with its depth; null when it is whole already.
 */
function promoted(ctx: WorkerContext, sceneId: number, obj: NumberedObject, sel: string): { depth: number; expr: string } | null {
  const count = countAtoms(ctx, sceneId, obj.uid, sel)
  const residues = `byres (${sel})`
  if (countAtoms(ctx, sceneId, obj.uid, residues) > count) return { depth: 0, expr: residues }
  const chains = emitContext(ctx, sceneId).chainsHit(obj.model, sel)
  const chainExpr = `chain ${chains.join(',')}`
  if (chains.length > 0 && countAtoms(ctx, sceneId, obj.uid, chainExpr) > count) return { depth: 1, expr: chainExpr }
  if (countAtoms(ctx, sceneId, obj.uid, ALL) > count) return { depth: 2, expr: ALL }
  return null
}

const selectUp = chxCommand({
  words: ['select', 'up'],
  args: [],
  mutates: false,
  summary: 'Widen the selection one level (atoms to residues, chains, models).',
  async run(ctx, _args, cc) {
    // As ChimeraX promotes: only the deepest level any molecule can widen at moves.
    const steps = new Map<number, { depth: number; expr: string }>()
    const before = new Map<number, string>()
    for (const obj of numberedObjects(ctx, cc.sceneId).filter(isMolecule)) {
      const sel = currentSel(ctx, cc.sceneId, obj.uid)
      before.set(obj.uid, sel)
      if (sel === NONE) continue
      const p = promoted(ctx, cc.sceneId, obj, sel)
      if (p) steps.set(obj.uid, p)
    }
    if (steps.size === 0) return writeSelections(ctx, cc, new Map())
    const depth = Math.min(...[...steps.values()].map((p) => p.depth))
    const next = new Map([...steps].filter(([, p]) => p.depth === depth).map(([uid, p]) => [uid, p.expr]))
    const res = await writeSelections(ctx, cc, next)
    if (!res.ok) return res
    const after = new Map([...before.keys()].map((uid) => [uid, currentSel(ctx, cc.sceneId, uid)]))
    promotions.set(cc.sceneId, [...(promotions.get(cc.sceneId) ?? []), { before, after }])
    return res
  },
})

const selectDown = chxCommand({
  words: ['select', 'down'],
  args: [],
  mutates: false,
  summary: 'Go back to the selection before the last select up.',
  async run(ctx, _args, cc) {
    const history = promotions.get(cc.sceneId) ?? []
    const last = history[history.length - 1]
    const mols = numberedObjects(ctx, cc.sceneId).filter(isMolecule)
    // A selection changed some other way since: the steps no longer lead back to it.
    const current = last !== undefined && mols.length === last.after.size &&
      mols.every((o) => last.after.get(o.uid) === currentSel(ctx, cc.sceneId, o.uid))
    if (!current) {
      promotions.delete(cc.sceneId)
      cc.print('Nothing to go back to (no select up since the selection last changed)')
      return { ok: true }
    }
    history.pop()
    return writeSelections(ctx, cc, last.before)
  },
})

/** Forget the select up steps (tests). */
export function resetPromotions(): void {
  promotions.clear()
}

const select = chxCommand({
  words: ['select'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'residues', type: BoolArg, role: 'keyword' },
    { name: 'minimumLength', type: StringArg, role: 'keyword', ignored: true },
    { name: 'maximumLength', type: StringArg, role: 'keyword', ignored: true },
    { name: 'sequence', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: false,
  summary: 'Select what is named (everything when nothing is), replacing the selection.',
  run(ctx, args, cc) {
    warnIgnored(cc, 'select', args, ['minimumLength', 'maximumLength', 'sequence'])
    return applySelect(ctx, cc, 'replace', args.objects, args.residues === 'true')
  },
})

/** `select add` / `select subtract` / `select intersect` / `~select`. */
function selectCombine(words: string[], combine: Combine, required: boolean): ChxCommand {
  return chxCommand({
    words,
    args: [
      { name: 'objects', type: SpecArg, role: required ? 'required' : 'optional' },
      { name: 'residues', type: BoolArg, role: 'keyword' },
    ],
    mutates: false,
    summary:
      combine === 'add' ? 'Add to the selection (everything when nothing is named).'
      : combine === 'subtract' ? 'Take from the selection (all of it when nothing is named).'
      : 'Keep only the part of the selection that is also named.',
    run(ctx, args, cc) {
      return applySelect(ctx, cc, combine, args.objects, args.residues === 'true')
    },
  })
}

const selectClear = chxCommand({
  words: ['select', 'clear'],
  args: [],
  mutates: false,
  summary: 'Clear the selection.',
  run(ctx, _args, cc) {
    return applySelect(ctx, cc, 'subtract', '', false)
  },
})

// --- name ---

/** A name CueMol's selection scanner reads as one reference (`SEL_TOKEN`). */
const NAME_RE = /^[_a-zA-Z0-9][*'_a-zA-Z0-9]*$/

const name = chxCommand({
  words: ['name'],
  args: [
    { name: 'name', type: StringArg, role: 'required' },
    { name: 'text', type: RestOfLine, role: 'optional' },
  ],
  mutates: false,
  summary: 'Name a specification, to use the name as a selector later; with no specification, show the definition.',
  async run(ctx, args, cc) {
    if (args.text.trim() === '') {
      const def = namedSelections(ctx, cc.sceneId).find((s) => s.name === args.name)
      if (!def) return { ok: false, error: `Error: no name "${args.name}"` }
      cc.print(`${def.name}: ${def.expr}`)
      return { ok: true }
    }
    if (!NAME_RE.test(args.name) || args.name === 'all' || args.name === 'sel') {
      return { ok: false, error: `Error: name: "${args.name}" cannot be a name (letters, digits and _ only; not all or sel)` }
    }
    const found = targetsOf(ctx, cc.sceneId, args.text)
    if (!found.ok) return found
    // One expression for every molecule: a specification that means one
    // thing in #1 and another in #2 cannot be kept as one.
    const mols = numberedObjects(ctx, cc.sceneId).filter(isMolecule)
    const exprs = new Set(mols.map((m) => found.targets.find((t) => t.obj.uid === m.uid)?.sel ?? NONE))
    if (exprs.size > 1) {
      return { ok: false, error: 'Error: name: the specification differs between models (it names a model, or reaches across them), which a CueMol named selection cannot keep' }
    }
    const expr = [...exprs][0] ?? NONE
    const res = await runOp(ctx, cc, 'define_selection', { name: args.name, selection: expr, styleSet: null })
    return res.ok ? { ok: true } : res
  },
})

const nameFrozen = chxCommand({
  words: ['name', 'frozen'],
  args: [{ name: 'rest', type: RestOfLine, role: 'optional' }],
  mutates: false,
  summary: 'Not supported: CueMol names an expression, not a fixed set of atoms.',
  run: () => ({ ok: false, error: 'Error: name frozen is not supported (a CueMol named selection is an expression, re-evaluated where it is used)' }),
})

const nameDelete = chxCommand({
  words: ['name', 'delete'],
  args: [{ name: 'name', type: StringArg, role: 'required' }],
  mutates: false,
  summary: 'Forget a name, or all of them.',
  async run(ctx, args, cc) {
    const defs = namedSelections(ctx, cc.sceneId).filter((s) => args.name === 'all' || s.name === args.name)
    if (defs.length === 0 && args.name !== 'all') return { ok: false, error: `Error: no name "${args.name}"` }
    for (const d of defs) {
      const res = await runOp(ctx, cc, 'remove_selection', { styleSet: d.styleSet, name: d.name })
      if (!res.ok) return res
    }
    return { ok: true }
  },
})

const nameList = chxCommand({
  words: ['name', 'list'],
  args: [{ name: 'builtins', type: StringArg, role: 'keyword', ignored: true }],
  mutates: false,
  summary: 'List the names.',
  run(ctx, _args, cc) {
    const defs = namedSelections(ctx, cc.sceneId)
    if (defs.length === 0) cc.print('There are no user-defined specifier names.')
    for (const d of defs) cc.print(`${d.name}: ${d.expr}`)
    return { ok: true }
  },
})

// --- info ---

/** The molecules a specification reaches (all when empty), each with its expression. */
function infoTargets(ctx: WorkerContext, sceneId: number, spec: string): Target[] | { ok: false; error: string } {
  const found = targetsOf(ctx, sceneId, spec)
  return found.ok ? found.targets : found
}

/** One molecule's chains, residues and atom count. */
function census(ctx: WorkerContext, sceneId: number, t: Target): { atoms: number; residues: number; chains: string[] } {
  let atoms = 0
  const residues = new Set<string>()
  const chains = new Set<string>()
  forEachAtom(ctx, sceneId, t.obj.uid, t.sel, (a) => {
    atoms++
    residues.add(`${a.chainName}:${a.residIndex}`)
    chains.add(a.chainName)
  })
  return { atoms, residues: residues.size, chains: [...chains] }
}

/** `info` / `info models`: a line for each model, with what it holds. */
function infoModels(ctx: WorkerContext, cc: CmdContext, spec: string): CmdOutcome {
  const objs: NumberedObject[] = numberedObjects(ctx, cc.sceneId)
  const targets = spec.trim() === '' ? null : infoTargets(ctx, cc.sceneId, spec)
  if (targets && !Array.isArray(targets)) return targets
  const shown = targets ? objs.filter((o) => targets.some((t) => t.obj.uid === o.uid)) : objs
  cc.print(`${shown.length} models`)
  for (const o of shown) {
    const props = getGenericProps(ctx, { sceneId: cc.sceneId, nodeId: o.uid, nodeType: 'object' })
    const visible = props.ok ? props.entries.find((e) => e.key === 'visible')?.value !== false : true
    cc.print(`#${o.model}, ${o.name}, ${visible ? 'shown' : 'hidden'}`)
    if (isMolecule(o)) {
      const c = census(ctx, cc.sceneId, { obj: o, sel: ALL })
      cc.print(`${c.atoms} atoms, ${c.residues} residues, ${c.chains.length} chains (${c.chains.join(',')})`)
    }
  }
  return { ok: true }
}

/** The atom attributes `info atoms ... attribute` can show. */
const ATOM_ATTRS: Readonly<Record<string, (a: AtomView) => string>> = {
  name: (a) => a.name,
  element: (a) => a.element,
  // Read as single precision in C++: trimmed so 10.8 is not 10.800000190734863.
  bfactor: (a) => String(Number(a.bfac.toPrecision(6))),
  occupancy: (a) => String(Number(a.occ.toPrecision(6))),
}

const info = chxCommand({
  words: ['info'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'saveFile', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: false,
  summary: 'Report the models: atoms, residues and chains.',
  run(ctx, args, cc) {
    warnIgnored(cc, 'info', args, ['saveFile'])
    return infoModels(ctx, cc, args.objects)
  },
})

/** `info models` / `chains` / `residues` / `atoms`. */
function infoLevel(level: 'models' | 'chains' | 'residues' | 'atoms'): ChxCommand {
  return chxCommand({
    words: ['info', level],
    args: [
      { name: 'objects', type: SpecArg, role: 'optional' },
      { name: 'attribute', type: StringArg, role: 'keyword' },
      { name: 'saveFile', type: StringArg, role: 'keyword', ignored: true },
    ],
    mutates: false,
    summary: `Report the ${level} named, one line each.`,
    run(ctx, args, cc) {
      warnIgnored(cc, `info ${level}`, args, ['saveFile'])
      if (level === 'models') {
        if (args.attribute !== '' && args.attribute !== 'name') return { ok: false, error: `Error: info models: attribute "${args.attribute}" is not supported (name only)` }
        const targets = infoTargets(ctx, cc.sceneId, args.objects)
        if (!Array.isArray(targets)) return targets
        for (const t of targets) cc.print(`model id #${t.obj.model} type ${t.obj.className} name ${t.obj.name}`)
        return { ok: true }
      }
      const targets = infoTargets(ctx, cc.sceneId, args.objects)
      if (!Array.isArray(targets)) return targets
      const attr = args.attribute
      if (level === 'chains' && attr !== '' && attr !== 'chain_id') return { ok: false, error: `Error: info chains: attribute "${attr}" is not supported (chain_id only)` }
      if (level === 'residues' && attr !== '' && attr !== 'name') return { ok: false, error: `Error: info residues: attribute "${attr}" is not supported (name only)` }
      if (level === 'atoms' && attr !== '' && !(attr in ATOM_ATTRS)) {
        return { ok: false, error: `Error: info atoms: attribute "${attr}" is not supported (one of ${Object.keys(ATOM_ATTRS).join(', ')})` }
      }
      for (const t of targets) {
        const seen = new Set<string>()
        forEachAtom(ctx, cc.sceneId, t.obj.uid, t.sel, (a) => {
          const res = `#${t.obj.model}/${a.chainName}:${a.residIndex}`
          if (level === 'chains') {
            if (!seen.has(a.chainName)) cc.print(`chain id #${t.obj.model}/${a.chainName} chain_id ${a.chainName}`)
            seen.add(a.chainName)
          } else if (level === 'residues') {
            if (!seen.has(res)) cc.print(`residue id ${res} name ${a.residName}`)
            seen.add(res)
          } else {
            // ChimeraX's default attribute is the IDATM type, which CueMol does not have.
            cc.print(`atom id ${res}@${a.name}${attr === '' ? '' : ` ${attr} ${ATOM_ATTRS[attr](a)}`}`)
          }
        })
      }
      return { ok: true }
    },
  })
}

export const SELECT_COMMANDS: Record<string, ChxCommand> = {
  select,
  selectAdd: selectCombine(['select', 'add'], 'add', false),
  selectSubtract: selectCombine(['select', 'subtract'], 'subtract', false),
  selectIntersect: selectCombine(['select', 'intersect'], 'intersect', true),
  selectClear,
  selectZone,
  selectUp,
  selectDown,
  unselect: selectCombine(['~select'], 'subtract', false),
  name,
  nameFrozen,
  nameDelete,
  nameList,
  info,
  infoModels: infoLevel('models'),
  infoChains: infoLevel('chains'),
  infoResidues: infoLevel('residues'),
  infoAtoms: infoLevel('atoms'),
}
