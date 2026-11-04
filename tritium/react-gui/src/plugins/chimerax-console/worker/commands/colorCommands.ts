/**
 * @file plugins/chimerax-console/worker/commands/colorCommands.ts
 * @description `color`: [spec] [color | byhetero | byelement], target.
 *
 * A colour is a paint entry put first in the paint table of each `chx:`
 * renderer the target reaches (`add_paint_at`), so a later `color` wins
 * over an earlier one where they overlap. The atom renderers all get the
 * same entries, so a colour stays when an atom changes style. A renderer is
 * switched to per-selection colouring only when it is not one already
 * (`ensurePaint`): switching starts a new table.
 *
 * `byhetero` colours every atom but carbon by element (Jmol colours, as
 * ChimeraX) and leaves carbons and the cartoon as they are; `byelement`
 * colours carbons too.
 */

import type { CmdOutcome } from '@plugins/console/worker/dialect-api'
import { ColorArg, EnumOf, Or, SpecArg, StringArg } from '../cli/argTypes'
import { chxCommand } from '../cli/command'
import type { ChxCommand } from '../cli/command'
import { ELEMENT_COLORS } from '../colorTables'
import { splitColorArg } from '../colors'
import { atomRenderers, cartoonRenderers, ensureOwned, ensurePaint, intersect, runOp, targetsOf } from '../display'
import { warnIgnored } from './warn'

/** The colourings by name ChimeraX has; the console does these two so far. */
const SPECIAL = ['byhetero', 'byelement']

/**
 * The elements `byhetero` / `byelement` paint: those common in
 * biomolecules and their ligands. A paint entry per element of the
 * periodic table would make the table unreadable for no gain.
 */
const PAINTED_ELEMENTS = ['C', 'N', 'O', 'S', 'P', 'H', 'F', 'Cl', 'Br', 'I', 'Se', 'Fe', 'Zn', 'Mg', 'Ca', 'Mn', 'Cu', 'Co', 'Ni', 'Na', 'K']

/** The paint entries a colour argument means inside `sel`: [selection, #rrggbb][]. */
function entriesFor(color: string, sel: string): [string, string][] {
  if (!SPECIAL.includes(color)) return [[sel, color]]
  const elements = color === 'byhetero' ? PAINTED_ELEMENTS.filter((e) => e !== 'C') : PAINTED_ELEMENTS
  return elements.map((e) => [intersect(sel, `elem ${e}`), ELEMENT_COLORS[e] ?? '#b4b4b4'])
}

const color: ChxCommand = chxCommand({
  words: ['color'],
  args: [
    { name: 'objects', type: SpecArg, role: 'optional' },
    { name: 'color', type: Or(ColorArg, EnumOf(SPECIAL)), role: 'optional' },
    { name: 'what', type: StringArg, role: 'optional', ignored: true },
    { name: 'target', type: StringArg, role: 'keyword' },
    { name: 'transparency', type: StringArg, role: 'keyword', ignored: true },
    { name: 'halfbond', type: StringArg, role: 'keyword', ignored: true },
  ],
  mutates: true,
  summary: 'Colour atoms and cartoons: a colour name, #hex, byhetero or byelement.',
  async run(ctx, args, cc): Promise<CmdOutcome> {
    warnIgnored(cc, 'color', args, ['what', 'transparency', 'halfbond'])
    if (args.color === '') return { ok: false, error: 'Error: color: give a colour, byhetero or byelement' }
    // CueMol's paint has no alpha; a colour that states one is drawn opaque.
    const { hex: colorValue, alpha } = SPECIAL.includes(args.color) ? { hex: args.color, alpha: null } : splitColorArg(args.color)
    if (alpha !== null && alpha < 1) cc.warn('color: transparency in a colour is not supported yet; drawn opaque')
    // ChimeraX's default target, acsbpf: atoms (and bonds), cartoons, surfaces...
    const target = args.target === '' ? 'acsbpf' : args.target
    const atoms = /[ab]/.test(target)
    // A colour by element is for atoms only; the cartoon keeps its colour.
    const cartoons = /[cr]/.test(target) && !SPECIAL.includes(colorValue)
    if (/s/.test(target) && args.target !== '') cc.warn('color: surfaces are not supported yet; ignored')
    const found = targetsOf(ctx, cc.sceneId, args.objects)
    if (!found.ok) return found
    for (const t of found.targets) {
      const owned = await ensureOwned(ctx, cc, t.obj)
      if (!owned.ok) return owned
      const r = atomRenderers(owned.ids)
      const rends = [...(atoms ? [r.stick, r.ball, r.sphere] : []), ...(cartoons ? cartoonRenderers(owned.ids).map((c) => c.id) : [])]
      for (const id of rends) {
        const painted = await ensurePaint(ctx, cc, id)
        if (!painted.ok) return painted
        for (const [selection, hex] of entriesFor(colorValue, t.sel)) {
          const res = await runOp(ctx, cc, 'add_paint_at', { nodeId: id, nodeType: 'renderer', selection, color: hex, at: 1 })
          if (!res.ok) return res
        }
      }
    }
    return { ok: true }
  },
})

export const COLOR_COMMANDS: Record<string, ChxCommand> = { color }
