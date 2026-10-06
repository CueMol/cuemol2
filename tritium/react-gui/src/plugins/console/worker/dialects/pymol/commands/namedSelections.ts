/**
 * @file plugins/console/worker/dialects/pymol/commands/namedSelections.ts
 * @description The scene's named selections, for commands that take a name.
 *
 * `select` stores a named selection in a writable style set of the scene
 * (`saveSelDef`). PyMOL's `delete`, `enable`, `disable` and `set_name` accept
 * a selection name as readily as an object name, so they look here once no
 * object or renderer answers to it.
 */

import { applyMolSelString } from '@renderer/worker/server/services/select/applyMolSelString'
import { saveSelDef } from '@renderer/worker/server/services/select/saveSelDef'
import { getStyleSetContents, removeStyleSetSelection } from '@renderer/worker/server/services/style/styleSetEdit'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { globToRegExp, isAllSelection, molecules } from './helpers'

/** One named selection and the style set that holds it. */
export interface NamedSelection {
  name: string
  /** The CueMol expression it stands for. */
  expr: string
  styleSetId: number
}

interface StyleSetEntry {
  uid?: number
  readonly?: boolean
}

/** Every named selection the scene's own writable style sets hold. */
export function namedSelections(ctx: WorkerContext, sceneId: number): NamedSelection[] {
  let sets: StyleSetEntry[] = []
  try {
    sets = JSON.parse(ctx.styleMgr.getStyleSetsJSON(sceneId) || '[]') as StyleSetEntry[]
  } catch {
    sets = []
  }
  const out: NamedSelection[] = []
  for (const set of sets) {
    if (typeof set.uid !== 'number' || set.readonly === true) continue
    const contents = getStyleSetContents(ctx, { styleSetId: set.uid })
    if (!contents.ok) continue
    for (const sel of contents.selections) {
      out.push({ name: sel.name, expr: sel.value, styleSetId: set.uid })
    }
  }
  return out
}

/** The named selections `pattern` names (`all`, a name, or a wildcard). */
export function matchNamedSelections(ctx: WorkerContext, sceneId: number, pattern: string): NamedSelection[] {
  const all = namedSelections(ctx, sceneId)
  if (isAllSelection(pattern)) return all
  const want = pattern.trim()
  const exact = all.filter((s) => s.name === want)
  if (exact.length > 0) return exact
  const re = globToRegExp(want)
  return all.filter((s) => re.test(s.name))
}

/** Forget a named selection. */
export function removeNamedSelection(ctx: WorkerContext, sceneId: number, sel: NamedSelection): boolean {
  return removeStyleSetSelection(ctx, { sceneId, styleSetId: sel.styleSetId, name: sel.name }).ok
}

/** Give a named selection another name. */
export function renameNamedSelection(
  ctx: WorkerContext,
  sceneId: number,
  sel: NamedSelection,
  newName: string,
): boolean {
  if (!saveSelDef(ctx, { sceneId, name: newName, expr: sel.expr }).ok) return false
  return removeNamedSelection(ctx, sceneId, sel)
}

/**
 * Show or hide a named selection the way PyMOL's enable / disable do: its
 * atoms become (or stop being) the molecules' current selection.
 */
export function showNamedSelection(ctx: WorkerContext, sceneId: number, sel: NamedSelection, show: boolean): void {
  for (const mol of molecules(ctx, sceneId)) {
    applyMolSelString(ctx, { sceneId, molId: mol.uid, selStr: show ? sel.expr : '' })
  }
}
