/**
 * @file plugins/console/renderer/runSubmission.ts
 * @description Running one submission to the end, for the panel and for
 * the command line alike.
 *
 * Usually that is one worker call. A scene command splits it: the worker
 * stops there and hands the command back (`sceneRequest`), this does it on
 * the tab strip, and the rest goes to the worker again, against whatever
 * scene is active by then. So `create_scene; fetch 1crn` fetches into the new
 * scene, and each scene's commands are one undo transaction in that scene.
 */

import type { AsyncCueMol, SceneTabs } from '@renderer/plugin-host/api'
import { consoleServices } from '../calls'
import type { ConsoleEntry, DialectId } from '../shared/consoleTypes'
import { doSceneRequest } from './sceneRequest'

export interface SubmissionDeps {
  cm: AsyncCueMol
  /** The active scene and view, making them when there is none. */
  ensureActiveScene: () => Promise<{ scene_uid: number; view_id: number } | undefined>
  tabs: SceneTabs
  /** Open a scene file the way File > Open does (`load x.qsc`); false when it failed. */
  openScene: (filePath: string) => Promise<boolean>
}

export interface SubmissionArgs {
  dialect: DialectId
  text: string
  runId: string
  /** The caller's own working directory (the command line); absent for the panel's. */
  cwd?: string
  /** Keep the worker calls out of the busy indicator (a script may run for minutes). */
  quiet?: boolean
  /** Whether Stop was pressed; checked between the parts of a split submission. */
  stopped: () => boolean
}

export interface SubmissionResult {
  entries: ConsoleEntry[]
  aborted: boolean
  interrupted: boolean
  /** Where `cd` left the caller's directory, when it passed one. */
  cwd?: string
}

export async function runSubmission(deps: SubmissionDeps, args: SubmissionArgs): Promise<SubmissionResult> {
  const entries: ConsoleEntry[] = []
  let cwd = args.cwd
  const failed = (text: string): SubmissionResult => {
    entries.push({ kind: 'error', text })
    return { entries, aborted: true, interrupted: false, cwd }
  }

  const run = (target: { scene_uid: number; view_id: number }, text: string) =>
    consoleServices.invoke(
      deps.cm,
      'runCommand',
      { dialect: args.dialect, sceneId: target.scene_uid, viewId: target.view_id, text, runId: args.runId, cwd },
      args.quiet ? { quiet: true } : undefined,
    )

  let text = args.text
  for (;;) {
    // With no tab open, the worker is asked first without a scene: a tab
    // command (list_scenes) runs without one, and only a command that needs
    // a scene gets one made for it.
    let res = (await deps.tabs.list()).length === 0 ? await run({ scene_uid: 0, view_id: 0 }, text) : null
    if (res === null || (!res.ok && res.code === 'not-found')) {
      const target = await deps.ensureActiveScene()
      if (!target) return failed('Error: no scene to run against')
      res = await run(target, text)
    }
    if (!res.ok) return failed(`Error: ${res.error}`)
    entries.push(...res.entries)
    cwd = res.cwd ?? cwd
    if (res.aborted) return { entries, aborted: true, interrupted: res.interrupted, cwd }

    // `load x.qsc`: always alone on its line, so nothing follows it.
    if (res.openScene && !(await deps.openScene(res.openScene))) {
      return failed(`Error: could not open ${res.openScene}`)
    }
    if (!res.sceneRequest) return { entries, aborted: false, interrupted: false, cwd }

    const done = await doSceneRequest(deps.tabs, res.sceneRequest)
    if (!done.ok) return failed(done.error)
    for (const line of done.lines) entries.push({ kind: 'output', text: line })
    if (!res.rest) return { entries, aborted: false, interrupted: false, cwd }
    if (args.stopped()) {
      entries.push({ kind: 'warning', text: 'Interrupted.' })
      return { entries, aborted: true, interrupted: true, cwd }
    }
    text = res.rest
  }
}
