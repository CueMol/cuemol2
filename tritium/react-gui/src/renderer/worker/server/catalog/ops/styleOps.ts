/**
 * @file worker/server/catalog/ops/styleOps.ts
 * @description Style set ops: the scene tree's style rows (create, delete,
 * read only, load and save) and the Style Editor's colours, selections and
 * styles.
 *
 * A set is named by its name, the scene's own set before a global one
 * (`styleSetByName`), so a recorded step replays in another scene that has a
 * set of that name.
 */

import { createStyleSet, destroyStyleSet, toggleStyleSetReadOnly } from '@renderer/worker/server/services/style/styleOps'
import { loadStyleSetFromFile, saveStyleSetToCurrentSrc, saveStyleSetToFile } from '@renderer/worker/server/services/style/styleFile'
import {
  getStyleSetContents,
  removeStyleSetColor,
  removeStyleSetSelection,
  removeStyleSetStyle,
  setStyleSetColor,
  findOrCreateSceneSet,
  styleSetScopeByName,
} from '@renderer/worker/server/services/style/styleSetEdit'
import { DEFAULT_SCENE_STYLE_SET } from '@renderer/worker/server/services/select/saveSelDef'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { withUndoTxn } from '@renderer/worker/server/services/withUndoTxn'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { defineOp } from '../op'
import type { OpOutcome } from '../op'
import { callerPath, outputPath } from '../outputFile'
import { boolean, color, optional, path, string } from '../params'

const EXPOSE = { tool: false, console: true, mcp: true } as const
const STYLE_SET = 'Name of the style set (the scene\'s own before a global one).'

/** The set `name` names, or why there is none. */
function setNamed(ctx: WorkerContext, sceneId: number, name: string): { styleSetId: number; scopeId: number } | { error: string } {
  return styleSetScopeByName(ctx, sceneId, name) ?? { error: `No single style set named "${name}".` }
}

export const createStyleSetOp = defineOp({
  name: 'create_style_set',
  description: 'Create an empty style set in the scene (scene tree > Styles > New).',
  params: { name: string('Name of the new set; not one the scene has.') },
  mutates: true,
  describe: (a) => `Create style set ${a.name}`,
  expose: EXPOSE,
  group: 'styles',
  run(ctx, args, oc) {
    return normalizeServiceResult(createStyleSet(ctx, { sceneId: oc.sceneId, name: args.name }), `The style set "${args.name}" could not be created (is the name taken?).`)
  },
})

export const deleteStyleSet = defineOp({
  name: 'delete_style_set',
  description: 'Delete a style set.',
  params: { styleSet: string(STYLE_SET) },
  mutates: true,
  describe: (a) => `Delete style set ${a.styleSet}`,
  expose: EXPOSE,
  group: 'styles',
  run(ctx, args, oc) {
    const set = setNamed(ctx, oc.sceneId, args.styleSet)
    if ('error' in set) return { ok: false, error: set.error }
    return normalizeServiceResult(destroyStyleSet(ctx, { sceneId: oc.sceneId, ...set }), `The style set "${args.styleSet}" could not be deleted.`)
  },
})

export const setStyleReadonly = defineOp({
  name: 'set_style_readonly',
  description: 'Make a scene\'s style set read only, or writable again. A changed set cannot be made read only.',
  params: { styleSet: string(STYLE_SET), readonly: boolean('True makes it read only.') },
  mutates: true,
  describe: (a) => `Make style set ${a.styleSet} ${a.readonly ? 'read only' : 'writable'}`,
  expose: EXPOSE,
  group: 'styles',
  run(ctx, args, oc) {
    const set = setNamed(ctx, oc.sceneId, args.styleSet)
    if ('error' in set) return { ok: false, error: set.error }
    const now = getStyleSetContents(ctx, { styleSetId: set.styleSetId })
    if (now.ok && now.readonly === args.readonly) return { ok: true }
    return normalizeServiceResult(
      toggleStyleSetReadOnly(ctx, { sceneId: oc.sceneId, ...set }),
      `"${args.styleSet}" could not be changed (a global set, or a changed one cannot be made read only).`,
    )
  },
})

export const loadStyleFile = defineOp({
  name: 'load_style_file',
  description: 'Load a style file into the scene as a read-only style set.',
  params: { path: path('The style file (.xml).') },
  mutates: true,
  describe: (a) => `Load style file ${a.path}`,
  expose: EXPOSE,
  group: 'styles',
  run(ctx, args, oc) {
    return normalizeServiceResult(loadStyleSetFromFile(ctx, { sceneId: oc.sceneId, path: callerPath(args.path) }), `${args.path} could not be loaded as a style file.`)
  },
})

export const saveStyleFile = defineOp({
  name: 'save_style_file',
  description: 'Save a style set to a file. Null path writes it back to the file it came from.',
  params: { styleSet: string(STYLE_SET), path: optional(path('Where to write it (.xml). Null uses its source file.')) },
  mutates: true,
  describe: (a) => `Save style set ${a.styleSet}${a.path === null ? '' : ` to ${a.path}`}`,
  expose: EXPOSE,
  group: 'styles',
  run(ctx, args, oc): OpOutcome {
    const set = setNamed(ctx, oc.sceneId, args.styleSet)
    if ('error' in set) return { ok: false, error: set.error }
    if (args.path === null) {
      const res = saveStyleSetToCurrentSrc(ctx, { sceneId: oc.sceneId, ...set })
      if (res.ok && !res.saved) return { ok: false, error: `"${args.styleSet}" has no source file; give a path.` }
      return normalizeServiceResult(res, `"${args.styleSet}" could not be saved.`)
    }
    const out = outputPath(oc, args.path, '.xml')
    if ('error' in out) return { ok: false, error: out.error }
    return normalizeServiceResult(saveStyleSetToFile(ctx, { sceneId: oc.sceneId, ...set, path: out.path }), `"${args.styleSet}" could not be saved to ${out.path}.`)
  },
})

export const defineColor = defineOp({
  name: 'define_color',
  description: 'Give a colour a name in a style set (the Style Editor\'s Colors tab), usable wherever a colour is.',
  params: {
    name: string('The colour\'s name.'),
    color: color('The colour: hex ("#FF0000"), a colour name, or hsb(h,s,b).'),
    styleSet: optional(string('The style set to keep it in (the scene\'s own before a global one; made in the scene when there is none). Null uses the set named "default".')),
  },
  mutates: true,
  describe: (a) => `Define colour ${a.name} ${a.color}`,
  expose: EXPOSE,
  group: 'styles',
  run(ctx, args, oc): OpOutcome {
    const scene = getSceneOrNull(ctx, oc.sceneId)
    if (!scene) return { ok: false, error: 'The scene could not be read.' }
    const setName = args.styleSet ?? DEFAULT_SCENE_STYLE_SET
    let res: OpOutcome = { ok: false, error: `No single style set named "${setName}", and none could be made.` }
    withUndoTxn(scene, 'Define color', () => {
      const set = findOrCreateSceneSet(ctx, oc.sceneId, setName)
      if (set === null) return
      res = normalizeServiceResult(
        setStyleSetColor(ctx, { sceneId: oc.sceneId, ...set, name: args.name, colorStr: args.color }),
        `The colour could not be kept in ${setName} (is it read only, and is the colour valid?).`,
      )
    })
    return res
  },
})

/** An op that removes one named entry of a style set. */
function removeOp(name: string, what: string, remove: typeof removeStyleSetColor) {
  return defineOp({
    name,
    description: `Remove a ${what} from a style set (the Style Editor).`,
    params: { styleSet: string(STYLE_SET), name: string(`The ${what}'s name.`) },
    mutates: true,
    describe: (a) => `Remove ${what} ${a.name} from ${a.styleSet}`,
    expose: EXPOSE,
    group: 'styles',
    run(ctx, args, oc) {
      const set = setNamed(ctx, oc.sceneId, args.styleSet)
      if ('error' in set) return { ok: false, error: set.error }
      return normalizeServiceResult(
        remove(ctx, { sceneId: oc.sceneId, styleSetId: set.styleSetId, name: args.name }),
        `The ${what} could not be removed (is ${args.styleSet} read only?).`,
      )
    },
  })
}

export const removeColor = removeOp('remove_color', 'colour', removeStyleSetColor)
export const removeSelection = removeOp('remove_selection', 'named selection', removeStyleSetSelection)
export const removeStyle = removeOp('remove_style', 'style', removeStyleSetStyle)

export const STYLE_OPS = [
  createStyleSetOp,
  deleteStyleSet,
  setStyleReadonly,
  loadStyleFile,
  saveStyleFile,
  defineColor,
  removeColor,
  removeSelection,
  removeStyle,
]
