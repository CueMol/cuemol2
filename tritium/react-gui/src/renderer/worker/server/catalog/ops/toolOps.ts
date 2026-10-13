/**
 * @file worker/server/catalog/ops/toolOps.ts
 * @description Tools-menu dialogs as commands: the surface cutter and the
 * morphing frames of a MolCoord object.
 *
 * Each runs the service its dialog commits through, with the dialog's
 * defaults, so a command and the dialog leave the scene the same way.
 */

import { cutSurfByPlane } from '@renderer/worker/server/services/molops/cutSurfByPlane'
import {
  addMorphFrameFromFile,
  addMorphFrameFromMol,
  convertToMorphMol,
  getMorphFrames,
  removeMorphFrame,
} from '@renderer/worker/server/services/morph/morphMol'
import type { MorphFrameInfo } from '@renderer/worker/server/services/morph/morphMol'
import { normalizeServiceResult } from '@renderer/worker/shared/serviceResult'
import { checkPosition, pickByNumber } from '@renderer/worker/shared/numbered'
import { failedWith } from '../errors'
import { defineOp } from '../op'
import { callerPath } from '../outputFile'
import { enumOf, integer, objectId, optional, path, real } from '../params'

/** Section mesh density of the cutter dialog. */
const CUT_DENSITY = 5.0

export const cutSurface = defineOp({
  name: 'cut_surface',
  description:
    'Cut a molecular surface object by the front clipping (slab) plane of the current view, ' +
    'as Tools > Mol surface cutter does. full keeps the surface and closes the cut with a ' +
    'cross section; separate puts the cross section in an object of its own; sect keeps only ' +
    'the cross section; body keeps the surface without one. Adjust the slab first (slab).',
  params: {
    surfId: objectId('Uid of the surface object.'),
    mode: optional(enumOf(['full', 'separate', 'sect', 'body'], 'What to keep. Null is full.')),
    density: optional(real(`Cross-section mesh density per angstrom. Null uses ${CUT_DENSITY}.`)),
  },
  mutates: true,
  describe: (a, n) => `Cut ${n('surfId')} by the slab plane (${a.mode})`,
  expose: { tool: false, console: true, mcp: true },
  group: 'surfaces',
  run(ctx, args, oc) {
    return normalizeServiceResult(
      cutSurfByPlane(ctx, {
        sceneId: oc.sceneId,
        viewId: oc.viewId,
        objId: args.surfId,
        mode: args.mode ?? 'full',
        density: args.density ?? CUT_DENSITY,
      }),
      'The surface could not be cut.',
    )
  },
})

/** A frame list as lines: number (from 1), name, where it came from. */
function frameLines(frames: readonly MorphFrameInfo[]): string[] {
  return frames.map((f, i) => `${i + 1}  ${f.isThis ? '(this)' : f.name}${f.src ? `  ${f.src}` : ''}`)
}

export const morphFrames = defineOp({
  name: 'list_morph_frames',
  description: 'List the frames of a morphing MolCoord object (made by add_morph_frame), in order.',
  params: { objId: objectId('Uid of the MolCoord object.', 'MolCoord') },
  mutates: false,
  expose: { tool: false, console: true, mcp: true },
  group: 'animation',
  format: (data) => frameLines((data as { frames: MorphFrameInfo[] }).frames),
  run(ctx, args, oc) {
    const res = getMorphFrames(ctx, { sceneId: oc.sceneId, objId: args.objId })
    if (!res.ok) return { ok: false, error: 'The frames could not be read.' }
    if (!res.isMorphMol) return { ok: false, error: 'This object has no morphing frames; add one with add_morph_frame.' }
    return { ok: true, data: { frames: res.frames } }
  },
})

export const morphAdd = defineOp({
  name: 'add_morph_frame',
  description:
    'Add a frame (another conformation of the same object) to a morphing animation, from a ' +
    'PDB file or from another MolCoord object in the scene. A plain MolCoord object is first turned into a ' +
    'morphing one, which gives it a new uid (returned). Play it with a Mol morphing element ' +
    'in the Animation panel.',
  params: {
    objId: objectId('Uid of the MolCoord object to morph.', 'MolCoord'),
    file: optional(path('PDB file (.pdb, .ent, optionally .gz) to add. Null uses fromObjId.')),
    fromObjId: optional(objectId('Uid of a MolCoord object whose coordinates to add. Null uses file.', 'MolCoord')),
    before: optional(integer('Insert before this frame, by its number in list_morph_frames (from 1). Null appends.')),
  },
  mutates: true,
  describe: (a, n) => `Add morph frame to ${n('objId')} from ${a.file ?? n('fromObjId')}`,
  expose: { tool: false, console: true, mcp: true },
  group: 'animation',
  run(ctx, args, oc) {
    if ((args.file === null) === (args.fromObjId === null)) {
      return { ok: false, error: 'Give either a file or fromObjId.' }
    }
    let objId = args.objId
    const frames = getMorphFrames(ctx, { sceneId: oc.sceneId, objId })
    if (!frames.ok) return { ok: false, error: 'The object could not be read.' }
    if (!frames.isMorphMol) {
      const conv = convertToMorphMol(ctx, { sceneId: oc.sceneId, objId })
      if (!conv.ok || conv.morphObjId === undefined) {
        return failedWith(conv, 'The object could not be made a morphing one.')
      }
      objId = conv.morphObjId
    }
    if (args.before !== null) {
      const bad = checkPosition(args.before, frames.frames.length, 'list_morph_frames')
      if (bad) return { ok: false, error: bad }
    }
    const insertIndex = args.before === null ? -1 : args.before - 1
    const added = args.file !== null
      ? addMorphFrameFromFile(ctx, { sceneId: oc.sceneId, objId, path: callerPath(args.file), insertIndex })
      : addMorphFrameFromMol(ctx, { sceneId: oc.sceneId, objId, srcObjId: args.fromObjId as number, insertIndex })
    if (!added.ok) return failedWith(added, 'The frame could not be added.')
    const after = getMorphFrames(ctx, { sceneId: oc.sceneId, objId })
    return { ok: true, data: { objectId: objId, frames: after.frames.length } }
  },
})

export const morphRemove = defineOp({
  name: 'remove_morph_frame',
  description: 'Remove one frame from a morphing MolCoord object, by its number in list_morph_frames (from 1). The base frame, (this), cannot be removed.',
  params: {
    objId: objectId('Uid of the morphing MolCoord object.', 'MolCoord'),
    frame: integer('The frame\'s number in list_morph_frames (from 1).'),
  },
  mutates: true,
  describe: (a, n) => `Remove morph frame ${a.frame} of ${n('objId')}`,
  expose: { tool: false, console: true, mcp: true },
  group: 'animation',
  run(ctx, args, oc) {
    const frames = getMorphFrames(ctx, { sceneId: oc.sceneId, objId: args.objId })
    if (!frames.ok || !frames.isMorphMol) return { ok: false, error: 'This object has no morphing frames.' }
    const frame = pickByNumber(frames.frames, args.frame, 'frame', 'list_morph_frames')
    if (typeof frame === 'string') return { ok: false, error: frame }
    return normalizeServiceResult(
      removeMorphFrame(ctx, { sceneId: oc.sceneId, objId: args.objId, frameIndex: args.frame - 1 }),
      'The frame could not be removed.',
    )
  },
})

export const TOOL_MENU_OPS = [cutSurface, morphFrames, morphAdd, morphRemove]
