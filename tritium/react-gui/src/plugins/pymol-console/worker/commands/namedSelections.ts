/**
 * @file plugins/pymol-console/worker/commands/namedSelections.ts
 * @description The scene's named selections, for commands that take a name.
 *
 * `select` stores a named selection in a writable style set of the scene
 * (`define_selection`, into the set `selectionStyleSet` names). PyMOL's `delete`, `enable`, `disable` and `set_name` accept
 * a selection name as readily as an object name, so they look here once no
 * object or renderer answers to it.
 */

import { getStyleSetContents } from '@renderer/worker/server/services/style/styleSetEdit'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from './types'
import { globToRegExp, isAllSelection, molecules, runOp, setMolSelection } from './helpers'

/** One named selection and the style set that holds it. */
export interface NamedSelection {
  name: string
  /** The CueMol expression it stands for. */
  expr: string
  styleSetId: number
  /** The name of that set, which the selection ops take. */
  styleSetName: string
}

interface StyleSetEntry {
  uid?: number
  name?: string
  scene_id?: number
  readonly?: boolean
}

/** The scene's style sets, as `getStyleSetsJSON` lists them. */
function styleSets(ctx: WorkerContext, sceneId: number): StyleSetEntry[] {
  try {
    return JSON.parse(ctx.styleMgr.getStyleSetsJSON(sceneId) || '[]') as StyleSetEntry[]
  } catch {
    return []
  }
}

/**
 * The style set `select` keeps a new name in: the scene's first writable
 * set, as the selection builder's Save does (`saveSelDef`). Null when the
 * scene has none; `define_selection` then makes one named `default`.
 */
export function selectionStyleSet(ctx: WorkerContext, sceneId: number): string | null {
  const set = styleSets(ctx, sceneId).find((s) => s.scene_id === sceneId && s.readonly === false)
  return set?.name ?? null
}

/** Every named selection the scene's own writable style sets hold. */
export function namedSelections(ctx: WorkerContext, sceneId: number): NamedSelection[] {
  const sets = styleSets(ctx, sceneId)
  const out: NamedSelection[] = []
  for (const set of sets) {
    if (typeof set.uid !== 'number' || set.readonly === true) continue
    const contents = getStyleSetContents(ctx, { styleSetId: set.uid })
    if (!contents.ok) continue
    for (const sel of contents.selections) {
      out.push({ name: sel.name, expr: sel.value, styleSetId: set.uid, styleSetName: set.name ?? '' })
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

/** Forget a named selection (`remove_selection`). */
export async function removeNamedSelection(ctx: WorkerContext, cc: CmdContext, sel: NamedSelection): Promise<boolean> {
  return (await runOp(ctx, cc, 'remove_selection', { styleSet: sel.styleSetName, name: sel.name })).ok
}

/** Give a named selection another name, in the set that holds it. */
export async function renameNamedSelection(
  ctx: WorkerContext,
  cc: CmdContext,
  sel: NamedSelection,
  newName: string,
): Promise<boolean> {
  const defined = await runOp(ctx, cc, 'define_selection', { name: newName, selection: sel.expr, styleSet: sel.styleSetName })
  if (!defined.ok) return false
  return removeNamedSelection(ctx, cc, sel)
}

/**
 * Show or hide a named selection the way PyMOL's enable / disable do: its
 * atoms become (or stop being) the molecules' current selection.
 */
export async function showNamedSelection(ctx: WorkerContext, cc: CmdContext, sel: NamedSelection, show: boolean): Promise<void> {
  for (const mol of molecules(ctx, cc.sceneId)) {
    await setMolSelection(ctx, cc, mol.uid, show ? sel.expr : '')
  }
}
