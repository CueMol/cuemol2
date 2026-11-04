/**
 * @file plugins/pymol-console/worker/commands/labelCommands.ts
 * @description `label`: text on atoms, through CueMol's label format.
 *
 * Each molecule gets one label renderer the console owns, `pym:labels`
 * (`*namelabel`), made the way a click-label is but under its own name, so
 * the labels a user clicks on are left alone. The text of each label is a
 * CueMol label format (`{resn}{resi}`) that the renderer evaluates in C++;
 * the PyMOL expression is only rewritten into one (`labelExpr.ts`).
 *
 * The labels go through the `set_atom_labels` op, so each molecule's
 * change is one recorded step (C++ records the label edits for undo).
 */

import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { selectionAtomIds } from '@renderer/worker/server/services/navi/atomLabels'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, PymCommand } from './types'
import { moleculeSelections } from './helpers'
import type { MoleculeSelection } from './helpers'
import { OWNED, renderersOf, runOp, setVisible } from './helpers'
import { pymolLabelFormat } from './labelExpr'
import { applyRememberedSettings } from './repSettings'

/** The name of the console's label renderer on each molecule. */
export const LABEL_RENDERER = `${OWNED}labels`

/** Most atoms one `label` may touch; a whole protein is almost never meant. */
const MAX_LABELS = 2000

/** The molecule's console label renderer, if it has one. */
function labelRendererId(ctx: WorkerContext, sceneId: number, objId: number): number | null {
  return renderersOf(ctx, sceneId, objId).find((r) => r.name === LABEL_RENDERER)?.id ?? null
}

/** The reason in a native exception, without the wrapper's preamble. */
function nativeReason(text: string): string {
  const m = /Reason:\s*([\s\S]*)$/.exec(text)
  return (m ? m[1] : text).trim()
}

const label: PymCommand = {
  name: 'label',
  params: [
    { name: 'selection', default: '(all)' },
    { name: 'expression', default: '' },
    { name: 'quiet', default: '1' },
  ],
  mode: 'strict',
  mutates: true,
  summary: 'Label atoms, e.g. label name CA, "%s%s" % (resn, resi); an empty expression removes labels.',
  completions: [{ source: 'selections', description: 'selection', suffix: ', ' }],
  async run(ctx, args, cc) {
    const translatedFormat = pymolLabelFormat(args.expression)
    if (!translatedFormat.ok) return translatedFormat
    const format = translatedFormat.format
    const removing = format === ''

    const sels = moleculeSelections(ctx, cc.sceneId, args.selection)
    if (!sels.ok) return sels
    const scene = getSceneOrNull(ctx, cc.sceneId)
    if (!scene) return { ok: false, error: 'Error: no scene' }

    // Every atom first, so nothing is labelled when the count is refused.
    const targets: MoleculeSelection[] = []
    let total = 0
    for (const item of sels.items) {
      const mol = scene.getObject(item.obj.uid)
      if (!mol) continue
      const ids = selectionAtomIds(ctx, cc.sceneId, mol, item.selStr)
      if (ids === null) return { ok: false, error: `Error: "${args.selection}" did not compile` }
      if (ids.length === 0) continue
      targets.push(item)
      total += ids.length
    }
    if (total === 0) return { ok: false, error: `Error: "${args.selection}" matched no atoms` }
    if (!removing && total > MAX_LABELS) {
      return { ok: false, error: `Error: ${total} atoms selected; label at most ${MAX_LABELS} at once` }
    }

    for (const t of targets) {
      // Labelling again after `hide labels` brings them back, as in PyMOL.
      const existing = labelRendererId(ctx, cc.sceneId, t.obj.uid)
      if (!removing && existing !== null) {
        await setVisible(ctx, cc, existing, 'renderer', true)
      }
      const res = await runOp(ctx, cc, 'set_atom_labels', {
        objId: t.obj.uid,
        selection: t.selStr,
        format: removing ? null : format,
        rendererName: LABEL_RENDERER,
      })
      if (!res.ok) return { ok: false, error: `Error: label: ${nativeReason(res.error.replace(/^Error: /, ''))}` }
      const made = res.data as { rendId?: number | null; created?: boolean } | undefined
      if (made?.created && typeof made.rendId === 'number') await applyRememberedSettings(ctx, cc, 'labels', made.rendId)
    }
    return { ok: true }
  },
}

/**
 * Show or hide the console's labels on each item's molecule (`show labels`
 * / `hide labels` over whole molecules).
 */
export async function setConsoleLabelsVisible(
  ctx: WorkerContext,
  cc: CmdContext,
  items: readonly MoleculeSelection[],
  visible: boolean,
): Promise<void> {
  for (const item of items) {
    const rend = renderersOf(ctx, cc.sceneId, item.obj.uid).find((r) => r.name === LABEL_RENDERER)
    if (rend) await setVisible(ctx, cc, rend.id, 'renderer', visible)
  }
}

/** Take the console's labels off the atoms of each item (`hide labels, sel`). */
export async function removeConsoleLabels(
  ctx: WorkerContext,
  cc: CmdContext,
  items: readonly MoleculeSelection[],
): Promise<boolean> {
  for (const item of items) {
    if (labelRendererId(ctx, cc.sceneId, item.obj.uid) === null) continue
    const res = await runOp(ctx, cc, 'set_atom_labels', {
      objId: item.obj.uid,
      selection: item.selStr,
      format: null,
      rendererName: LABEL_RENDERER,
    })
    if (!res.ok) return false
  }
  return true
}

export const LABEL_COMMANDS: PymCommand[] = [label]
