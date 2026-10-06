/**
 * @file plugins/console/worker/dialects/pymol/commands/movieCommands.ts
 * @description `mplay`, `mstop`, `rewind`, `frame` and `count_states`.
 *
 * PyMOL has one movie that also steps every object through its states. In
 * CueMol those are two things: the scene's animation timeline (AnimMgr) is
 * the movie, and a multi-frame object -- a MorphMol, or an MD trajectory --
 * has a `frame` of its own. So `mplay` / `mstop` drive the timeline, and
 * `frame` / `count_states` read and move objects' frames.
 *
 * A trajectory's playback loop runs in the Trajectory tab (renderer side),
 * not in the worker, so `mplay` cannot start it; it says so.
 *
 * PyMOL numbers states from 1, CueMol frames from 0.
 */

import { goTime, pause, play } from '@renderer/worker/server/services/anim/transport'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import type { SceneObjectEntry } from '@renderer/worker/server/services/scene/listSceneObjects'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext, PymCommand } from './types'
import { isAllSelection, resolveObjects, toNumber } from './helpers'

/** An object's frame cursor: MorphMol and Trajectory both have one. */
interface FramedObject {
  nframe: number
  frame: number
}

/** One object that has more than one frame. */
interface FramedEntry {
  entry: SceneObjectEntry
  obj: FramedObject
  nframe: number
}

/** The objects `pattern` names that have frames, with how many. */
function framedObjects(ctx: WorkerContext, sceneId: number, pattern: string): FramedEntry[] {
  const scene = getSceneOrNull(ctx, sceneId)
  if (!scene) return []
  const out: FramedEntry[] = []
  for (const entry of resolveObjects(ctx, sceneId, isAllSelection(pattern) ? 'all' : pattern)) {
    const obj = scene.getObject(entry.uid) as unknown as FramedObject | null
    if (!obj) continue
    let nframe = 0
    try {
      // Absent on an ordinary molecule: the getter throws or is undefined.
      nframe = Number(obj.nframe) || 0
    } catch {
      nframe = 0
    }
    if (nframe > 0) out.push({ entry, obj, nframe })
  }
  return out
}

/**
 * Put every framed object on `frame` (0-based), clamped to its own range.
 *
 * @returns how many objects moved.
 */
function setFrames(targets: FramedEntry[], frame: number, cc: CmdContext): number {
  let moved = 0
  for (const t of targets) {
    const clamped = Math.max(0, Math.min(frame, t.nframe - 1))
    if (clamped !== frame) cc.warn(`"${t.entry.name}" has ${t.nframe} states; showing state ${clamped + 1}`)
    try {
      t.obj.frame = clamped
      moved += 1
    } catch {
      cc.warn(`cannot move "${t.entry.name}" to state ${clamped + 1}`)
    }
  }
  return moved
}

const frameCmd: PymCommand = {
  name: 'frame',
  params: [{ name: 'frame' }, { name: 'trigger', default: '-1' }, { name: 'scene', default: '0' }],
  mode: 'strict',
  mutates: false,
  summary: 'Show state N of every multi-state object (MorphMol, trajectory).',
  run(ctx, args, cc) {
    const n = toNumber(args.frame)
    if (n === null || !Number.isInteger(n) || n < 1) {
      return { ok: false, error: 'Error: frame must be a whole number from 1' }
    }
    const targets = framedObjects(ctx, cc.sceneId, 'all')
    if (targets.length === 0) return { ok: false, error: 'Error: no object in the scene has more than one state' }
    setFrames(targets, n - 1, cc)
    return { ok: true }
  },
}

const rewind: PymCommand = {
  name: 'rewind',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: 'Go back to the first state, and to the start of the animation.',
  run(ctx, _args, cc) {
    const targets = framedObjects(ctx, cc.sceneId, 'all')
    setFrames(targets, 0, cc)
    // Seeking the timeline fails when the scene has none; nothing to rewind.
    goTime(ctx, { sceneId: cc.sceneId, viewId: cc.viewId, ms: 0 })
    return { ok: true }
  },
}

const countStates: PymCommand = {
  name: 'count_states',
  params: [{ name: 'selection', default: '(all)' }, { name: 'quiet', default: '1' }],
  mode: 'strict',
  mutates: false,
  summary: 'Print the largest number of states among the named objects.',
  completions: [{ source: 'objects', description: 'object', suffix: '' }],
  run(ctx, args, cc) {
    const named = resolveObjects(ctx, cc.sceneId, isAllSelection(args.selection) ? 'all' : args.selection)
    if (named.length === 0) return { ok: false, error: `Error: no object matches "${args.selection}"` }
    const framed = framedObjects(ctx, cc.sceneId, args.selection)
    // An ordinary object has one state, as in PyMOL.
    const states = Math.max(1, ...framed.map((f) => f.nframe))
    cc.print(` cmd.count_states: ${states} states.`)
    return { ok: true }
  },
}

const mplay: PymCommand = {
  name: 'mplay',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: 'Play the scene animation (the Animation panel timeline).',
  run(ctx, _args, cc) {
    const res = play(ctx, { sceneId: cc.sceneId, viewId: cc.viewId })
    if (res.ok) return { ok: true }
    const traj = framedObjects(ctx, cc.sceneId, 'all').length > 0
    return {
      ok: false,
      error:
        `Error: cannot play the animation: ${res.error}` +
        (traj ? ' (a trajectory plays from the Trajectory tab, not from here)' : ''),
    }
  },
}

const mstop: PymCommand = {
  name: 'mstop',
  params: [],
  mode: 'strict',
  mutates: false,
  summary: 'Stop the scene animation where it is.',
  run(ctx, _args, cc) {
    // PyMOL's mstop leaves the movie on the current frame; stop() would
    // rewind it, pause() does not.
    const res = pause(ctx, { sceneId: cc.sceneId })
    return res.ok ? { ok: true } : { ok: false, error: `Error: cannot stop the animation: ${res.error}` }
  },
}

export const MOVIE_COMMANDS: PymCommand[] = [frameCmd, rewind, countStates, mplay, mstop]
