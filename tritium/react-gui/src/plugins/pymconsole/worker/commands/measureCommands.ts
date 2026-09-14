/**
 * @file plugins/pymconsole/worker/commands/measureCommands.ts
 * @description `distance`, `angle` and `dihedral`.
 *
 * PyMOL takes a selection per atom and measures between whatever they match.
 * CueMol draws a label between named atoms, so each argument has to come
 * down to one atom -- which is what a measurement means anyway.
 *
 * How that atom is found is the restriction worth knowing about: the
 * selection must name it the way `MolCoord.getAtom` does, as a chain, a
 * residue and an atom name (`chain A and resi 10 and name CA`, in any
 * order). Resolving an arbitrary expression to its atom ids would mean
 * reading a packed `ByteArray` back out of the addon, which nothing else in
 * the app does; naming the atom goes through the call the measure tool and
 * the AI agent already use.
 *
 * The label is drawn by that tool's own helper, so a distance typed here and
 * one picked with the mouse land in the same label set and look the same. The
 * number is also printed, which PyMOL does only under `quiet=0` -- on a
 * console the answer is the point of asking.
 */

import {
  appendMeasureLabel,
  hasDegenerateAtoms,
  measureAtomCount,
} from '@renderer/worker/server/services/helpers/atomintr'
import type {
  MeasureAtomRef,
  MeasureMode,
} from '@renderer/worker/server/services/helpers/atomintr'
import {
  angleOf,
  distanceOf,
  torsionOf,
} from '@renderer/worker/server/services/helpers/geometry'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import type { MolAtom } from '@cuemol/core/src/wrappers/MolAtom'
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { parseSelection, SelParseError } from '../sel/parse'
import type { SelNode } from '../sel/parse'
import type { CmdOutcome, PymCommand } from './types'
import { molecules } from './helpers'

/** An atom named the way `getAtom` wants it. */
interface AtomSpec {
  chain: string
  resid: string
  name: string
}

/** One resolved atom, and the molecule it came out of. */
interface FoundAtom {
  objId: number
  mol: MolCoord
  atom: MolAtom
}

/**
 * Whether a property value names one thing rather than a set of them.
 *
 * The value is still in PyMOL's spelling here, before the emitter rewrites
 * it, so all four ways of writing more than one have to be caught: `,` and
 * `+` separate a list, `-` makes a range (except leading, where it is a
 * negative residue number), `:` is the CueMol range someone may type anyway,
 * and `*` / `?` are wildcards.
 */
function namesOneThing(value: string): boolean {
  if (value === '') return false
  if (/[,+:*?]/.test(value)) return false
  return !value.slice(1).includes('-')
}

/**
 * The atom a selection names, when it names exactly one.
 *
 * Accepts a conjunction of `chain`, `resi` and `name`, each with a single
 * value. Anything else -- a union, a range, a class macro -- can match more
 * than one atom, and is refused rather than silently resolved to the first.
 */
function atomSpecOf(node: SelNode): AtomSpec | null {
  const parts: Partial<AtomSpec> = {}
  const walk = (n: SelNode): boolean => {
    if (n.kind === 'and') return walk(n.left) && walk(n.right)
    if (n.kind !== 'prop') return false
    if (!namesOneThing(n.value)) return false
    switch (n.keyword) {
      case 'chain':
        parts.chain = n.value
        return true
      case 'resi':
        parts.resid = n.value
        return true
      case 'name':
        parts.name = n.value
        return true
      default:
        return false
    }
  }
  if (!walk(node)) return null
  if (parts.chain === undefined || parts.resid === undefined || parts.name === undefined) {
    return null
  }
  return parts as AtomSpec
}

/**
 * Look the atom up in each molecule until one has it.
 *
 * Searching them all rather than requiring an object name is what lets a
 * measurement span two molecules, as the mouse tool can.
 */
function findAtom(ctx: WorkerContext, sceneId: number, spec: AtomSpec): FoundAtom | null {
  const scene = getSceneOrNull(ctx, sceneId)
  if (!scene) return null
  for (const entry of molecules(ctx, sceneId)) {
    const mol = scene.getObject(entry.uid) as unknown as MolCoord | null
    if (!mol || typeof mol.getAtom !== 'function') continue
    let atom: MolAtom | null = null
    try {
      atom = mol.getAtom(spec.chain, spec.resid, spec.name) as MolAtom | null
    } catch {
      // Not in this molecule; try the next.
      atom = null
    }
    if (atom) return { objId: entry.uid, mol, atom }
  }
  return null
}

/** The measured number, or null where the geometry is undefined. */
function measureValue(mode: MeasureMode, found: FoundAtom[]): number | null {
  const p = found.map((f) => f.atom.pos)
  if (mode === 'distance') return distanceOf(p[0], p[1])
  if (mode === 'angle') return angleOf(p[0], p[1], p[2])
  return torsionOf(p[0], p[1], p[2], p[3])
}

/** `distance` / `angle` / `dihedral`, which differ only in how many atoms. */
function measureCommand(name: 'distance' | 'angle' | 'dihedral', mode: MeasureMode): PymCommand {
  const count = measureAtomCount(mode)
  const selectionParams = Array.from({ length: count }, (_, i) => ({
    name: `selection${i + 1}`,
    default: '',
  }))
  const unit = mode === 'distance' ? 'angstroms' : 'degrees'
  return {
    name,
    params: [{ name: 'name', default: '' }, ...selectionParams],
    // PyMOL's `distance d, sel1, sel2` names the label first.
    mode: 'legacy',
    mutates: true,
    summary: `Measure and label the ${mode} between ${count} named atoms.`,
    completions: [
      null,
      ...selectionParams.map(() => ({
        source: 'selections' as const,
        description: 'selection',
        suffix: ', ' as const,
      })),
    ],
    run(ctx, args, cc) {
      const scene = getSceneOrNull(ctx, cc.sceneId)
      if (!scene) return { ok: false, error: 'Error: no scene' }

      // Every atom is resolved before anything is drawn, so a typo in the
      // last argument cannot leave a half-drawn label behind.
      const found: FoundAtom[] = []
      for (let i = 0; i < count; i += 1) {
        const raw = args[`selection${i + 1}`] ?? ''
        const one = resolveOne(ctx, cc.sceneId, raw, name, count)
        if (!one.ok) return one
        found.push(one.atom)
      }

      const refs: MeasureAtomRef[] = found.map((f) => ({ objId: f.objId, atomId: f.atom.id }))
      if (hasDegenerateAtoms(mode, refs)) {
        return { ok: false, error: `Error: ${name} needs ${count} different atoms` }
      }
      const value = measureValue(mode, found)
      if (value === null || !Number.isFinite(value)) {
        return { ok: false, error: `Error: these atoms are collinear, so the ${mode} is undefined` }
      }

      // The label belongs to the first atom's molecule: `appendMeasureLabel`
      // takes that atom as its own and every later one by object uid.
      const target = args.name.trim()
      appendMeasureLabel(scene, found[0].mol, mode, refs, target === '' ? undefined : target)
      // Two decimals, as the coordinates themselves are given to about that.
      cc.print(` ${name}: ${(Math.round(value * 100) / 100).toFixed(2)} ${unit}`)
      return { ok: true }
    },
  }
}

/** Resolve one selection argument to a single atom, or say what is wrong. */
function resolveOne(
  ctx: WorkerContext,
  sceneId: number,
  raw: string,
  name: string,
  count: number,
): ({ ok: true; atom: FoundAtom }) | (CmdOutcome & { ok: false }) {
  if (raw.trim() === '') {
    return { ok: false, error: `Error: ${name} needs ${count} selections` }
  }
  let spec: AtomSpec | null
  try {
    spec = atomSpecOf(parseSelection(raw))
  } catch (e) {
    if (e instanceof SelParseError) return { ok: false, error: `Error: ${e.message}` }
    throw e
  }
  if (spec === null) {
    return {
      ok: false,
      error:
        `Error: "${raw}" must name one atom as a chain, a residue and an atom name ` +
        '(e.g. "chain A and resi 10 and name CA")',
    }
  }
  const atom = findAtom(ctx, sceneId, spec)
  if (atom === null) return { ok: false, error: `Error: no atom matches "${raw}"` }
  return { ok: true, atom }
}

export const MEASURE_COMMANDS: PymCommand[] = [
  measureCommand('distance', 'distance'),
  measureCommand('angle', 'angle'),
  measureCommand('dihedral', 'torsion'),
]
