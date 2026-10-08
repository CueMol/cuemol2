/**
 * @file plugins/console/renderer/useConsoleEndpoint.ts
 * @description The `console` endpoint of the local API server: runs what the
 * `cuemol-console` command line sends, as if typed into the panel.
 *
 * Open while the plugin is on and "Command line access" is set. A run goes
 * to the same worker service as the panel's, against the active tab, with
 * the client's own working directory (the worker keeps none for it). What it
 * printed is also appended to the panel's transcript, its echo marked
 * `[cli]`, so the window shows what changed the scene.
 */

import { useRef, useState } from 'react'
import {
  useActiveScene,
  useCommands,
  useCueMol,
  useEnsureActiveScene,
  useLocalApiEndpoint,
  usePluginPrefs,
  useSuppressUndoRedo,
} from '@renderer/plugin-host/api'
import { CmdId } from '@renderer/commands/ids'
import type {
  ConsoleCompleteRequest,
  ConsoleCompleteResponse,
  ConsoleRunRequest,
  ConsoleRunResponse,
} from '@shared/types/localApi'
import { consoleServices } from '../calls'
import { CONSOLE_PLUGIN_ID, REMOTE_ACCESS_PREF } from '../shared/consoleTypes'
import { consoleSession } from './consoleSessionStore'

/** Marks a command-line submission in the panel's transcript. */
export const CLI_ECHO_PREFIX = '[cli] '

export function useConsoleEndpoint(): void {
  const { cm } = useCueMol()
  const ensureActiveScene = useEnsureActiveScene()
  const { activeSceneId, activeMolViewId } = useActiveScene()
  const { dispatch } = useCommands()
  const { prefs } = usePluginPrefs(CONSOLE_PLUGIN_ID)
  const [running, setRunning] = useState(0)
  // As for a panel run: the worker holds a transaction open.
  useSuppressUndoRedo(running > 0)
  const runIds = useRef(new Map<number, string>())

  useLocalApiEndpoint('console', cm !== null && prefs[REMOTE_ACCESS_PREF] === true, {
    async handle({ reqId, kind, payload }) {
      if (!cm) throw new Error('CueMol is not ready yet.')
      if (kind === 'complete') {
        const p = payload as ConsoleCompleteRequest
        const res = await consoleServices.invoke(cm, 'complete', {
          dialect: p.dialect,
          sceneId: activeSceneId ?? 0,
          viewId: activeMolViewId ?? 0,
          line: p.line,
          cwd: p.cwd,
        })
        if (!res.ok) return { error: res.error }
        const answer: ConsoleCompleteResponse = { replacement: res.replacement, messages: res.messages }
        return answer
      }
      if (kind !== 'run') throw new Error(`Unknown request: ${kind}`)

      const p = payload as ConsoleRunRequest
      const runId = `cli-${reqId}`
      runIds.current.set(reqId, runId)
      setRunning((n) => n + 1)
      try {
        const target = await ensureActiveScene()
        if (!target) return { error: 'No scene to run against.' }
        const res = await consoleServices.invoke(
          cm,
          'runCommand',
          { dialect: p.dialect, sceneId: target.scene_uid, viewId: target.view_id, text: p.text, runId, cwd: p.cwd },
          // A script can run for minutes; the busy indicator is not the place.
          { quiet: true },
        )
        if (!res.ok) return { error: res.error }
        consoleSession.append(
          res.entries.map((e) => (e.kind === 'echo' ? { ...e, text: `${CLI_ECHO_PREFIX}${e.text}` } : e)),
        )
        const entries = [...res.entries]
        if (res.openScene) {
          const opened = await dispatch(CmdId.OpenSceneByPath, res.openScene)
          if (opened && !opened.loaded) entries.push({ kind: 'error', text: `Error: could not open ${res.openScene}` })
        }
        const answer: ConsoleRunResponse = {
          entries,
          aborted: res.aborted,
          interrupted: res.interrupted,
          cwd: res.cwd ?? p.cwd,
        }
        return answer
      } finally {
        runIds.current.delete(reqId)
        setRunning((n) => n - 1)
      }
    },
    cancel(reqId) {
      const runId = runIds.current.get(reqId)
      if (cm && runId) void consoleServices.invoke(cm, 'cancelRun', { runId })
    },
  })
}
