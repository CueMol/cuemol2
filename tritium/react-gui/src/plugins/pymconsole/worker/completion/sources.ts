/**
 * @file plugins/pymconsole/worker/completion/sources.ts
 * @description Where each kind of completion candidate comes from.
 *
 * A command declares a source by id rather than by handing over a function,
 * so the catalogue stays plain data: a spec can be read, tested and printed
 * without dragging a `WorkerContext` along with it.
 *
 * Every source is read fresh on each Tab. PyMOL does the same (its shortcut
 * entries are lambdas that rebuild the name list per keystroke), and it is
 * the whole reason a newly loaded object can be completed a second later
 * without anything having to invalidate a cache.
 */

import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { getGenericProps } from '@renderer/worker/server/services/props/read'
import { getSelDefs } from '@renderer/worker/server/services/select/getSelDefs'
import { listSceneObjects } from '@renderer/worker/server/services/scene/listSceneObjects'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { selectionKeywords } from '../sel/translate'
import { loadFormatNames } from '../commands/fileCommands'
import { mapRendererNames } from '../commands/mapCommands'
import { representationNames } from '../commands/repCommands'
import { storedCameraNames } from '../commands/viewCommands'
import { PYMOL_COLORS } from '../commands/pymolColors'
import { SETTING_ALIASES, findEntry, resolveTarget } from '../commands/settingCommands'
import type { CmdContext } from '../commands/types'

/** The kinds of candidate a command argument can ask for. */
export type CompletionSourceId =
  | 'commands'
  | 'objects'
  | 'names'
  | 'selections'
  | 'settings'
  | 'settingValue'
  | 'colors'
  | 'cameras'
  | 'viewActions'
  | 'representations'
  | 'mapRenderers'
  | 'readers'

/** What a source is given: the scene it runs against and the arguments so far. */
export interface SourceContext {
  sceneId: number
  viewId: number
  /**
   * The argument values typed before the one being completed, in order.
   *
   * Only `settingValue` reads this -- it has to know which property is being
   * set before it can say what the values are. PyMOL has no equivalent; its
   * sources see nothing but the pattern.
   */
  argsSoFar: readonly string[]
}

/** Object names in the scene. */
function objectNames(ctx: WorkerContext, sceneId: number): string[] {
  return listSceneObjects(ctx, { sceneId })
    .objects.map((o) => o.name)
    .filter((n) => n !== '')
}

/** Object names plus the scene's named selections -- PyMOL's `get_names('public')`. */
function publicNames(ctx: WorkerContext, sceneId: number): string[] {
  const defs = getSelDefs(ctx, { sceneId })
  return [...objectNames(ctx, sceneId), ...defs.scene]
}

/** Property names writable on the scene, plus the PyMOL aliases for them. */
function settingNames(ctx: WorkerContext, sceneId: number): string[] {
  const props = getGenericProps(ctx, { sceneId, nodeId: sceneId, nodeType: 'scene' })
  const names = props.ok ? props.entries.filter((e) => !e.readonly).map((e) => e.key) : []
  return [...new Set([...names, ...Object.keys(SETTING_ALIASES)])]
}

/**
 * The values the property named by the first argument accepts.
 *
 * PyMOL completes nothing here, which sends `set <name>, <TAB>` off to glob
 * the current directory -- filenames, for a property value. Where CueMol
 * knows the answer exactly, it is given: an enumerated property lists its
 * values and a flag lists `on` / `off`. Anything whose values are open
 * (a number, a name, a colour) returns null and falls back to files, as
 * PyMOL does.
 */
function settingValues(ctx: WorkerContext, sc: SourceContext): string[] | null {
  const typed = (sc.argsSoFar[0] ?? '').trim()
  if (typed === '') return null
  const alias = SETTING_ALIASES[typed]
  const propName = alias?.prop ?? typed
  // The same resolution `set` itself does, so the two cannot disagree about
  // which node a bare `set name, value` writes to.
  const cc = { sceneId: sc.sceneId, viewId: sc.viewId } as CmdContext
  const target = resolveTarget(ctx, cc, '', alias)
  if (!target.ok) return null
  const entry = findEntry(ctx, cc, target.target, propName)
  if (!entry || entry.readonly) return null
  if (entry.enumdef && entry.enumdef.length > 0) return [...entry.enumdef]
  if (entry.type === 'boolean') return alias?.invert ? ['off', 'on'] : ['on', 'off']
  return null
}

/**
 * Colour names.
 *
 * The PyMOL table first, because `toCueMolColor` prefers it, plus whatever
 * the running scene defines. Read straight off `StyleManager` rather than
 * through `getNamedColors`, which also resolves every colour to RGB -- work
 * a name list does not need.
 */
function colorNames(ctx: WorkerContext, sceneId: number): string[] {
  const defined: string[] = []
  for (const scope of [0, sceneId]) {
    try {
      defined.push(...(JSON.parse(ctx.styleMgr.getColorDefsJSON(scope)) as string[]))
    } catch {
      // A scope with no definitions; nothing to add.
    }
  }
  return [...new Set([...Object.keys(PYMOL_COLORS), ...defined])]
}

/**
 * The candidates for one source.
 *
 * @returns the candidate names, or null when this source cannot answer and
 *   the caller should fall back to filename completion.
 */
export function candidatesFor(
  id: CompletionSourceId,
  ctx: WorkerContext,
  sc: SourceContext,
  commandNames: readonly string[],
): string[] | null {
  // Without a scene only the catalogue and the filesystem are knowable.
  const hasScene = sc.sceneId > 0 && getSceneOrNull(ctx, sc.sceneId) !== null

  switch (id) {
    case 'commands':
      return [...commandNames]
    case 'viewActions':
      return ['store', 'recall', 'clear']
    case 'representations':
      return representationNames()
    case 'mapRenderers':
      return hasScene ? mapRendererNames(ctx, sc.sceneId) : []
    case 'readers':
      // Registered readers, so a format that does not exist in this build is
      // never offered.
      return loadFormatNames(ctx)
    case 'objects':
      return hasScene ? objectNames(ctx, sc.sceneId) : []
    case 'names':
      return hasScene ? publicNames(ctx, sc.sceneId) : []
    case 'selections':
      // PyMOL's selection source is `get_names('public')` plus the selection
      // keywords, so `zoom ch<TAB>` completes `chain ` as it does there.
      return hasScene ? [...publicNames(ctx, sc.sceneId), ...selectionKeywords()] : []
    case 'settings':
      return hasScene ? settingNames(ctx, sc.sceneId) : []
    case 'settingValue':
      return hasScene ? settingValues(ctx, sc) : null
    case 'colors':
      return colorNames(ctx, hasScene ? sc.sceneId : 0)
    case 'cameras':
      return hasScene ? storedCameraNames(ctx, sc.sceneId) : []
  }
}
