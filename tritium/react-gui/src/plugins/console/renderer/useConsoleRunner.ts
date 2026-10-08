/**
 * @file plugins/console/renderer/useConsoleRunner.ts
 * @description Sending a submitted line to the worker and collecting what
 * comes back.
 *
 * Lives in the plugin `Root`, not the panel, because the bottom panel mounts
 * only its active tab: a run started from the console has to survive the user
 * switching to Output to watch the log.
 *
 * The target scene is resolved through `useEnsureActiveScene`, so `load` as
 * the first thing typed into a fresh window creates the tab it needs rather
 * than failing.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useCommands, useCueMol, useEnsureActiveScene, useSceneTabs, useSuppressUndoRedo } from '@renderer/plugin-host/api'
import { CmdId } from '@renderer/commands/ids'
import { consoleServices } from '../calls'
import type { DialectId } from '../shared/consoleTypes'
import { consoleSession, useConsoleSession } from './consoleSessionStore'
import { runSubmission } from './runSubmission'

/** A fresh run id. `crypto.randomUUID` is missing on some older hosts. */
function makeRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Registers the runner the panel calls. Renders nothing. */
export function useConsoleRunner(): void {
  const { cm } = useCueMol()
  const ensureActiveScene = useEnsureActiveScene()
  const { dispatch } = useCommands()
  const tabs = useSceneTabs()
  const { running } = useConsoleSession()
  const openScene = useCallback(
    async (filePath: string) => (await dispatch(CmdId.OpenSceneByPath, filePath))?.loaded !== false,
    [dispatch],
  )

  // A transaction is open in the worker for the length of a submission;
  // undoing into it would land the scene somewhere nobody has seen.
  useSuppressUndoRedo(running)

  // The run in flight, for Stop. Not state: nothing renders from it.
  const runIdRef = useRef<string | null>(null)
  // Stop between the parts of a submission a scene command split.
  const stoppedRef = useRef(false)

  const run = useCallback(
    (text: string, dialect: DialectId) => {
      if (!cm) {
        consoleSession.failed('Error: CueMol is not ready yet')
        return
      }
      consoleSession.begin()
      const runId = makeRunId()
      runIdRef.current = runId
      stoppedRef.current = false
      void (async () => {
        try {
          const res = await runSubmission(
            { cm, ensureActiveScene, tabs, openScene },
            { dialect, text, runId, stopped: () => stoppedRef.current },
          )
          consoleSession.finish(res.entries)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('console: runCommand failed:', e)
          consoleSession.failed(`Error: ${msg}`)
        } finally {
          if (runIdRef.current === runId) runIdRef.current = null
        }
      })()
    },
    [cm, ensureActiveScene, tabs, openScene],
  )

  const stop = useCallback(() => {
    const runId = runIdRef.current
    if (!cm || !runId) return
    stoppedRef.current = true
    void consoleServices
      .invoke(cm, 'cancelRun', { runId })
      .catch((e: unknown) => { console.warn('console cancelRun:', e) })
  }, [cm])

  useEffect(() => {
    consoleSession.setRunner(run, stop)
  }, [run, stop])

  // Switching the plugin off unmounts the Root; drop the session with it.
  useEffect(() => {
    return () => {
      consoleSession.reset()
    }
  }, [])
}
