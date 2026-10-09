/**
 * @file plugins/console/renderer/useConsoleEndpoint.ts
 * @description The `console` endpoint of the local API server: runs what the
 * `tritium_cli` command line sends, as if typed into the panel.
 *
 * Open while the plugin is on and "Command line access" is set, or for the
 * whole run of an app that tritium_cli launched (`useCliAccessGranted`). A run goes
 * to the same worker service as the panel's, against the active tab, with
 * the client's own working directory (the worker keeps none for it). What it
 * printed is also appended to the panel's transcript, its echo marked
 * `[cli]`, so the window shows what changed the scene.
 */

import { useCallback, useRef, useState } from 'react'
import {
  useActiveScene,
  useCliAccessGranted,
  useCueMol,
  useEnsureActiveScene,
  useLocalApiEndpoint,
  useOpenSceneFile,
  usePluginPrefs,
  useSceneTabs,
  useSuppressUndoRedo,
} from '@renderer/plugin-host/api'
import type {
  ConsoleCompleteRequest,
  ConsoleCompleteResponse,
  ConsoleInfoResponse,
  ConsoleRunRequest,
  ConsoleRunResponse,
} from '@shared/types/localApi'
import { consoleServices } from '../calls'
import { CONSOLE_PLUGIN_ID, REMOTE_ACCESS_PREF } from '../shared/consoleTypes'
import { beginCliRun } from './cliActivity'
import { consoleSession } from './consoleSessionStore'
import { runSubmission } from './runSubmission'

/** Marks a command-line submission in the panel's transcript. */
export const CLI_ECHO_PREFIX = '[cli] '

export function useConsoleEndpoint(): void {
  const { cm } = useCueMol()
  const ensureActiveScene = useEnsureActiveScene()
  const { activeSceneId, activeMolViewId } = useActiveScene()
  const { prefs } = usePluginPrefs(CONSOLE_PLUGIN_ID)
  const [running, setRunning] = useState(0)
  // As for a panel run: the worker holds a transaction open.
  useSuppressUndoRedo(running > 0)
  const runIds = useRef(new Map<number, string>())
  // Requests whose client went away, for a submission a scene command split.
  const stopped = useRef(new Set<number>())
  const tabs = useSceneTabs()
  const openSceneFile = useOpenSceneFile()
  const openScene = useCallback(async (filePath: string) => (await openSceneFile(filePath)).ok, [openSceneFile])

  const cliLaunched = useCliAccessGranted()

  useLocalApiEndpoint('console', cm !== null && (prefs[REMOTE_ACCESS_PREF] === true || cliLaunched), {
    async handle({ reqId, kind, payload }) {
      if (!cm) throw new Error('CueMol is not ready yet.')
      if (kind === 'info') {
        const { version, build } = await cm.getAppInfo()
        const answer: ConsoleInfoResponse = { version, build }
        return answer
      }
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
      const end = beginCliRun()
      try {
        const res = await runSubmission(
          { cm, ensureActiveScene, tabs, openScene },
          // A script can run for minutes; the busy indicator is not the place.
          { dialect: p.dialect, text: p.text, runId, cwd: p.cwd, quiet: true, stopped: () => stopped.current.has(reqId) },
        )
        consoleSession.append(
          res.entries.map((e) => (e.kind === 'echo' ? { ...e, text: `${CLI_ECHO_PREFIX}${e.text}` } : e)),
        )
        const answer: ConsoleRunResponse = {
          entries: res.entries,
          aborted: res.aborted,
          interrupted: res.interrupted,
          cwd: res.cwd ?? p.cwd,
        }
        return answer
      } finally {
        runIds.current.delete(reqId)
        stopped.current.delete(reqId)
        setRunning((n) => n - 1)
        end()
      }
    },
    cancel(reqId) {
      const runId = runIds.current.get(reqId)
      if (runId) stopped.current.add(reqId)
      if (cm && runId) void consoleServices.invoke(cm, 'cancelRun', { runId })
    },
  })
}
