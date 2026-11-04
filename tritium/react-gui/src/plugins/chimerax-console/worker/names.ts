/**
 * @file plugins/chimerax-console/worker/names.ts
 * @description The scene's named selections, for `name` and as selectors.
 *
 * A named selection lives in a writable style set of the scene (the one
 * `define_selection` keeps it in), as a CueMol expression. ChimeraX's `name`
 * defines one; any specification can then use the name as a selector
 * (`color site red`), which CueMol reads as a reference. Read only.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
// Read-only helpers: listing the named selections is no operation of its own (op-catalog.md 3.1).
import { getSelDefs } from '@renderer/worker/server/services/select/getSelDefs'
import { getStyleSetContents } from '@renderer/worker/server/services/style/styleSetEdit'

/** One named selection and the style set that keeps it. */
export interface NamedSelection {
  name: string
  /** The CueMol expression it stands for. */
  expr: string
  styleSet: string
}

interface StyleSetEntry {
  uid?: number
  name?: string
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
    for (const sel of contents.selections) out.push({ name: sel.name, expr: sel.value, styleSet: set.name ?? '' })
  }
  return out
}

/** The names a specification may use as selectors: the scene's named selections and the global ones. */
export function selectionNames(ctx: WorkerContext, sceneId: number): Set<string> {
  try {
    const defs = getSelDefs(ctx, { sceneId })
    return new Set([...defs.scene, ...defs.global])
  } catch {
    return new Set()
  }
}
