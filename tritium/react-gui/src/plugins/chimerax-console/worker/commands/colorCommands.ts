/**
 * @file plugins/chimerax-console/worker/commands/colorCommands.ts
 * @description `color`: [spec] [color | byhetero | byelement | bychain |
 * bymodel], target; and `rainbow`.
 *
 * A colour is a paint entry put first in the paint table of each `chx:`
 * renderer the target reaches (`add_paint_at`), so a later `color` wins
 * over an earlier one where they overlap. A colouring that covers a whole
 * molecule (a colour, `bychain` or `bymodel` on `#1` or on everything)
 * hides every entry before it, so those are cleared first: the table does
 * not grow each time the molecule is coloured again. The atom renderers all get the
 * same entries, so a colour stays when an atom changes style. A renderer is
 * switched to per-selection colouring only when it is not one already
 * (`ensurePaint`): switching starts a new table.
 *
 * `byhetero` colours every atom but carbon by element (Jmol colours, as
 * ChimeraX) and leaves carbons and the cartoon as they are; `byelement`
 * colours carbons too. `bychain` and `bymodel` colour atoms, cartoons and
 * surfaces alike (`colorSchemes.ts`). `bypolymer` and `byidentity` need
 * ChimeraX's seeded random colours and are refused. `random` (a colour per
 * atom in ChimeraX) is refused too: an entry per atom, or even per residue,
 * makes the paint table as long as the molecule and colouring slow.
 *
 * `rainbow` colours each chain's residues along a palette, in RAINBOW_STEPS
 * colours, one paint entry per run of residues of one colour.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, CmdOutcome } from '@plugins/console/worker/dialect-api'
import { ColorArg, EnumOf, FloatArg, Or, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { ELEMENT_COLORS } from '../colorTables'
import { splitColorArg } from '../colors'
import { chainColor, modelColor, paletteColors, plddtEntries, RAINBOW, rainbowRanges, readPalette } from '../colorSchemes'
import { atomRenderers, cartoonRenderers, emitContext, ensureOwned, ensurePaint, forEachAtom, intersect, paintCount, runOp, targetsOf } from '../display'
import type { Target } from '../display'
import type { NumberedObject } from '../models'
import { surfacesOn } from '../surface'
import { warnIgnored } from './warn'

/** The colourings by name the console does. */
const SPECIAL = ['byhetero', 'byelement', 'bychain', 'bymodel']

/** Those that colour atoms only, leaving the cartoon as it is. */
const ATOMS_ONLY = ['byhetero', 'byelement']

/** Those that leave out some atoms of what they colour (carbons), so cannot replace the table. */
const PARTIAL = ATOMS_ONLY

/** ChimeraX's other colourings by name: refused, with the reason. */
const REFUSED: Readonly<Record<string, string>> = {
  bypolymer: 'it needs ChimeraX\'s seeded random colour per sequence',
  byidentity: 'it needs ChimeraX\'s seeded random colour per sequence',
  bynucleotide: 'not supported yet',
  byatom: 'use byelement',
  fromatoms: 'not supported yet',
  fromcartoons: 'not supported yet',
  fromribbons: 'not supported yet',
  random: 'a colour per atom makes the paint table as long as the molecule',
}

/**
 * The elements `byhetero` / `byelement` paint: those common in
 * biomolecules and their ligands. A paint entry per element of the
 * periodic table would make the table unreadable for no gain.
 */
const PAINTED_ELEMENTS = ['C', 'N', 'O', 'S', 'P', 'H', 'F', 'Cl', 'Br', 'I', 'Se', 'Fe', 'Zn', 'Mg', 'Ca', 'Mn', 'Cu', 'Co', 'Ni', 'Na', 'K']

/** A paint entry: [selection, #rrggbb]. */
export type PaintEntry = [string, string]

/** The polymer residues, which ChimeraX's chains are made of. */
const POLYMER = '(protein or nucleic)'

/** The residues `expr` reaches in a molecule, by chain, in chain order. */
export function residuesByChain(ctx: WorkerContext, sceneId: number, objUid: number, expr: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const seen = new Set<string>()
  forEachAtom(ctx, sceneId, objUid, expr, (a) => {
    const key = `${a.chainName}:${a.residIndex}`
    if (seen.has(key)) return
    seen.add(key)
    const list = out.get(a.chainName) ?? []
    list.push(a.residIndex)
    out.set(a.chainName, list)
  })
  return out
}

/** Paint entries colouring the atoms of `sel` by element, carbon left out unless `carbon`. */
export function elementEntries(sel: string, carbon: boolean): PaintEntry[] {
  const elements = carbon ? PAINTED_ELEMENTS : PAINTED_ELEMENTS.filter((e) => e !== 'C')
  return elements.map((e) => [intersect(sel, `elem ${e}`), ELEMENT_COLORS[e] ?? '#b4b4b4'])
}

/** The paint entries a colour argument means in a target. */
function entriesFor(ctx: WorkerContext, cc: CmdContext, color: string, t: Target): PaintEntry[] {
  if (ATOMS_ONLY.includes(color)) return elementEntries(t.sel, color === 'byelement')
  if (color === 'bychain') {
    return emitContext(ctx, cc.sceneId).chainsHit(t.obj.model, t.sel).map((chain) => {
      const c = chainColor(chain)
      if (!c.exact) cc.warn(`color: chain ${chain} has no colour in ChimeraX's table; its colour differs from ChimeraX's`)
      return [intersect(t.sel, `chain ${chain}`), c.hex]
    })
  }
  if (color === 'bymodel') {
    const c = modelColor(t.obj.model)
    if (!c.exact) cc.warn(`color: #${t.obj.model} is past ChimeraX's model colours; its colour differs from ChimeraX's`)
    return [[t.sel, c.hex]]
  }
  return [[t.sel, color]]
}

/**
 * Put paint entries first in the tables of the renderers target letters
 * name on a molecule: a, b atoms; c, r cartoons (unless `atomsOnly`); s the
 * surfaces there are (colouring does not make one).
 *
 * @param replace - the entries colour every atom of the molecule, so the
 *   entries already there can never show again: clear them first
 */
export async function paintTarget(ctx: WorkerContext, cc: CmdContext, t: Target, target: string, entries: readonly PaintEntry[], atomsOnly = false, replace = false): Promise<CmdOutcome> {
  if (entries.length === 0) return { ok: true }
  const owned = await ensureOwned(ctx, cc, t.obj)
  if (!owned.ok) return owned
  const r = atomRenderers(owned.ids)
  const rends = [
    ...(/[ab]/.test(target) ? [r.stick, r.ball, r.sphere] : []),
    ...(/[cr]/.test(target) && !atomsOnly ? cartoonRenderers(owned.ids).map((c) => c.id) : []),
    ...(/s/.test(target) ? surfacesOn(ctx, cc.sceneId, t.obj.uid).map((s) => s.id) : []),
  ]
  for (const id of rends) {
    const painted = await ensurePaint(ctx, cc, id)
    if (!painted.ok) return painted
    if (replace && paintCount(ctx, cc.sceneId, id) > 0) {
      const cleared = await runOp(ctx, cc, 'clear_paint', { nodeId: id, nodeType: 'renderer' })
      if (!cleared.ok) return cleared
    }
    for (const [selection, hex] of entries) {
      const res = await runOp(ctx, cc, 'add_paint_at', { nodeId: id, nodeType: 'renderer', selection, color: hex, at: 1 })
      if (!res.ok) return res
    }
  }
  return { ok: true }
}

/**
 * Colour a whole molecule by pLDDT, as ChimeraX colours an AlphaFold model
 * when it opens (`alphafold/fetch.py` `_color_by_confidence`): atoms and
 * cartoons, replacing the colours it was opened with.
 */
export function colorByPlddt(ctx: WorkerContext, cc: CmdContext, obj: NumberedObject): Promise<CmdOutcome> {
  return paintTarget(ctx, cc, { obj, sel: '*' }, 'ac', plddtEntries(), false, true)
}

/** ChimeraX's default target, acsbpf: atoms (and bonds), cartoons, surfaces... */
const DEFAULT_TARGET = 'acsbpf'

const color: ChxCommand = chxCommand({
  words: ['color'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'color', type: Or(ColorArg, EnumOf([...SPECIAL, ...Object.keys(REFUSED)])), role: 'optional' },
    { name: 'what', type: StringArg, role: 'optional', ignored: true },
    { name: 'target', type: StringArg, role: 'keyword' },
    { name: 'transparency', type: StringArg, role: 'keyword', ignored: true },
    { name: 'halfbond', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: true,
  summary: 'Colour atoms, cartoons and surfaces: a colour, byhetero, byelement, bychain or bymodel.',
  async run(ctx, args, cc): Promise<CmdOutcome> {
    warnIgnored(cc, 'color', args, ['what', 'transparency', 'halfbond'])
    if (args.color === '') return { ok: false, error: 'Error: color: give a colour or one of byhetero, byelement, bychain, bymodel' }
    const refused = REFUSED[args.color]
    if (refused) return { ok: false, error: `Error: color: ${args.color} is not supported (${refused})` }
    // CueMol's paint has no alpha; a colour that states one is drawn opaque.
    const { hex: colorValue, alpha } = SPECIAL.includes(args.color) ? { hex: args.color, alpha: null } : splitColorArg(args.color)
    if (alpha !== null && alpha < 1) cc.warn('color: transparency in a colour is not supported yet; drawn opaque')
    const target = args.target === '' ? DEFAULT_TARGET : args.target
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    for (const t of found.targets) {
      // On the whole molecule, every colouring but a partial one covers each atom.
      const replace = t.sel === '*' && !PARTIAL.includes(colorValue)
      const res = await paintTarget(ctx, cc, t, target, entriesFor(ctx, cc, colorValue, t), ATOMS_ONLY.includes(colorValue), replace)
      if (!res.ok) return res
    }
    return { ok: true }
  },
})

const LEVELS = ['residues', 'chains', 'polymers', 'structures']

const rainbow: ChxCommand = chxCommand({
  words: ['rainbow'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'level', type: EnumOf(LEVELS), role: 'optional', default: 'residues' },
    { name: 'target', type: StringArg, role: 'keyword' },
    { name: 'transparency', type: FloatArg, role: 'keyword', ignored: true },
    { name: 'palette', type: StringArg, role: 'keyword' },
  ],
  mutates: true,
  summary: 'Colour residues along each chain (or chains, or models) through a palette, blue to red.',
  async run(ctx, args, cc): Promise<CmdOutcome> {
    warnIgnored(cc, 'rainbow', args, ['transparency'])
    if (args.level === 'polymers') return { ok: false, error: 'Error: rainbow: polymers is not supported (the console does not compare sequences)' }
    const pal = args.palette === '' ? { ok: true as const, palette: RAINBOW } : readPalette(args.palette)
    if (!pal.ok) return { ok: false, error: `Error: rainbow: ${pal.error}` }
    const target = args.target === '' ? DEFAULT_TARGET : args.target
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    const modelHexes = paletteColors(pal.palette, found.targets.length)
    for (const [i, t] of found.targets.entries()) {
      let entries: PaintEntry[]
      if (args.level === 'structures') {
        entries = [[t.sel, modelHexes[i]]]
      } else if (args.level === 'chains') {
        // As ChimeraX, the whole of each chain reached, in chain id order.
        const chains = emitContext(ctx, cc.sceneId).chainsHit(t.obj.model, intersect(t.sel, POLYMER))
        const hexes = paletteColors(pal.palette, chains.length)
        entries = chains.map((c, k) => [`chain ${c} and ${POLYMER}`, hexes[k]])
      } else {
        entries = []
        for (const [chain, residues] of residuesByChain(ctx, cc.sceneId, t.obj.uid, intersect(t.sel, POLYMER))) {
          for (const [first, last, hex] of rainbowRanges(residues, pal.palette)) {
            const resi = first === last ? first : `${first}:${last}`
            entries.push([intersect(t.sel, `chain ${chain} and resi ${resi} and ${POLYMER}`), hex])
          }
        }
      }
      const res = await paintTarget(ctx, cc, t, target, entries)
      if (!res.ok) return res
    }
    return { ok: true }
  },
})

export const COLOR_COMMANDS: Record<string, ChxCommand> = { color, rainbow }
