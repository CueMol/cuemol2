/**
 * @file plugins/pymconsole/renderer/usePymCommandRunner.ts
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
import { useCueMol, useEnsureActiveScene, useSuppressUndoRedo } from '@renderer/plugin-host/api'
import { pymServices } from '../calls'
import { consoleSession, useConsoleSession } from './consoleSessionStore'

/** A fresh run id. `crypto.randomUUID` is missing on some older hosts. */
function makeRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Registers the runner the panel calls. Renders nothing. */
export function usePymCommandRunner(): void {
  const { cm } = useCueMol()
  const ensureActiveScene = useEnsureActiveScene()
  const { running } = useConsoleSession()

  // A transaction is open in the worker for the length of a submission;
  // undoing into it would land the scene somewhere nobody has seen.
  useSuppressUndoRedo(running)

  // The run in flight, for Stop. Not state: nothing renders from it.
  const runIdRef = useRef<string | null>(null)

  const run = useCallback(
    (text: string) => {
      if (!cm) {
        consoleSession.failed('Error: CueMol is not ready yet')
        return
      }
      consoleSession.begin()
      const runId = makeRunId()
      runIdRef.current = runId
      ;(async () => {
        try {
          const target = await ensureActiveScene()
          if (!target) {
            consoleSession.failed('Error: no scene to run against')
            return
          }
          const res = await pymServices.invoke(cm, 'runCommand', {
            sceneId: target.scene_uid,
            viewId: target.view_id,
            text,
            runId,
          })
          if (!res.ok) {
            consoleSession.failed(`Error: ${res.error}`)
            return
          }
          consoleSession.finish(res.entries)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('pymconsole: runCommand failed:', e)
          consoleSession.failed(`Error: ${msg}`)
        } finally {
          if (runIdRef.current === runId) runIdRef.current = null
        }
      })()
    },
    [cm, ensureActiveScene],
  )

  const stop = useCallback(() => {
    const runId = runIdRef.current
    if (!cm || !runId) return
    void pymServices
      .invoke(cm, 'cancelRun', { runId })
      .catch((e: unknown) => { console.warn('pymconsole cancelRun:', e) })
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
