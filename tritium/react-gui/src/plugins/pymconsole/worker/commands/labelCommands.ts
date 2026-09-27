/**
 * @file plugins/pymconsole/worker/commands/labelCommands.ts
 * @description `label`: text on atoms, through CueMol's label format.
 *
 * Each molecule gets one label renderer the console owns, `pym:labels`
 * (`*namelabel`), made the way a click-label is (`naviTool.ts`) but under
 * its own name, so the labels a user clicks on are left alone. The text of
 * each label is a CueMol label format (`{resn}{resi}`) that the renderer
 * evaluates in C++; the PyMOL expression is only rewritten into one
 * (`labelExpr.ts`).
 *
 * Adding and removing labels is not recorded for undo: the label renderer
 * keeps no undo information, for clicked labels either. Creating the
 * renderer is undone like any other.
 */

import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { translateSelection } from '../sel/translate'
import type { PymCommand } from './types'
import { isAllSelection, molecules } from './helpers'
import { pymolLabelFormat } from './labelExpr'
import { OWNED, renderersOf } from './repCommands'

/** The name of the console's label renderer on each molecule. */
export const LABEL_RENDERER = `${OWNED}labels`

/** Most atoms one `label` may touch; a whole protein is almost never meant. */
const MAX_LABELS = 2000

interface LabelRenderer {
  name: string
  maxlabel: number
  applyStyles(style: string): void
  setLabel(aid: number, format: string): boolean
  removeLabel(aid: number): boolean
}

interface AtomIter {
  target: unknown
  sel: unknown
  first(): void
  next(): void
  hasMore(): boolean
  getID(): number
}

/** The atom ids of `selStr` in one molecule. */
function atomIds(ctx: WorkerContext, sceneId: number, mol: unknown, selStr: string): number[] | null {
  const sel = makeSel(ctx, selStr, sceneId)
  const iter = ctx.svc.createObj('AtomIterator') as unknown as AtomIter | null
  if (!sel || !iter) return null
  iter.target = mol
  iter.sel = sel
  const ids: number[] = []
  for (iter.first(); iter.hasMore(); iter.next()) ids.push(iter.getID())
  return ids
}

/** The molecule's console label renderer, made when `create` and missing. */
function labelRenderer(
  ctx: WorkerContext,
  sceneId: number,
  objId: number,
  mol: { createRenderer(type: string): unknown },
  create: boolean,
): LabelRenderer | null {
  const scene = getSceneOrNull(ctx, sceneId)
  const found = renderersOf(ctx, sceneId, objId).find((r) => r.name === LABEL_RENDERER)
  if (found) return (scene?.getRenderer(found.id) as unknown as LabelRenderer | null) ?? null
  if (!create) return null
  const rend = mol.createRenderer('*namelabel') as LabelRenderer | null
  if (!rend) return null
  rend.applyStyles('DefaultLabel')
  rend.name = LABEL_RENDERER
  return rend
}

/** The reason in a native exception, without the wrapper's preamble. */
function nativeReason(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e)
  const m = /Reason:\s*([\s\S]*)$/.exec(text)
  return (m ? m[1] : text).trim()
}

const label: PymCommand = {
  name: 'label',
  params: [{ name: 'selection', default: '(all)' }, { name: 'expression', default: '' }],
  mode: 'strict',
  mutates: true,
  summary: 'Label atoms, e.g. label name CA, "%s%s" % (resn, resi); an empty expression removes labels.',
  completions: [{ source: 'selections', description: 'selection', suffix: ', ' }],
  run(ctx, args, cc) {
    const translatedFormat = pymolLabelFormat(args.expression)
    if (!translatedFormat.ok) return translatedFormat
    const format = translatedFormat.format
    const removing = format === ''

    let selStr = '*'
    if (!isAllSelection(args.selection)) {
      const translated = translateSelection(args.selection)
      if (!translated.ok) return translated
      selStr = translated.expr
    }

    const scene = getSceneOrNull(ctx, cc.sceneId)
    const mols = molecules(ctx, cc.sceneId)
    if (!scene || mols.length === 0) return { ok: false, error: 'Error: no molecule in the scene' }

    // Every atom first, so nothing is labelled when the count is refused.
    const targets: { obj: (typeof mols)[number]; mol: { createRenderer(type: string): unknown }; ids: number[] }[] = []
    let total = 0
    for (const obj of mols) {
      const mol = scene.getObject(obj.uid) as unknown as { createRenderer(type: string): unknown } | null
      if (!mol) continue
      const ids = atomIds(ctx, cc.sceneId, mol, selStr)
      if (ids === null) return { ok: false, error: `Error: "${args.selection}" did not compile` }
      if (ids.length === 0) continue
      targets.push({ obj, mol, ids })
      total += ids.length
    }
    if (total === 0) return { ok: false, error: `Error: "${args.selection}" matched no atoms` }
    if (!removing && total > MAX_LABELS) {
      return { ok: false, error: `Error: ${total} atoms selected; label at most ${MAX_LABELS} at once` }
    }

    for (const t of targets) {
      const rend = labelRenderer(ctx, cc.sceneId, t.obj.uid, t.mol, !removing)
      if (!rend) {
        if (removing) continue
        return { ok: false, error: `Error: cannot make a label renderer on "${t.obj.name}"` }
      }
      try {
        if (removing) {
          for (const aid of t.ids) rend.removeLabel(aid)
        } else {
          // The renderer drops its oldest labels beyond maxlabel.
          rend.maxlabel = rend.maxlabel + t.ids.length
          for (const aid of t.ids) rend.setLabel(aid, format)
        }
      } catch (e) {
        return { ok: false, error: `Error: label: ${nativeReason(e)}` }
      }
    }
    return { ok: true }
  },
}

export const LABEL_COMMANDS: PymCommand[] = [label]
