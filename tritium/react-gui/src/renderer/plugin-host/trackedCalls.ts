/**
 * @file renderer/plugin-host/trackedCalls.ts
 * @description Bookkeeping for the long requests a local API endpoint runs:
 * which are running, under what id, and which the client has abandoned.
 *
 * The console and MCP endpoints both run work that holds an undo
 * transaction open in the worker, can take minutes, and is cancelled when
 * the client goes away. Each request is tracked by its relay `reqId` and the
 * worker-side id it runs under (a run id, a call id).
 */

import { useCallback, useRef, useState } from 'react'
import { useSuppressUndoRedo } from '@renderer/contexts/UndoRedoLockContext'

export interface TrackedEndpointCalls {
  /**
   * Run `body` as request `reqId`, known to the worker as `id`. Undo and redo
   * are off while any tracked request runs: undoing into an open
   * transaction would land the scene somewhere nobody has seen.
   */
  track<T>(reqId: number, id: string, body: () => Promise<T>): Promise<T>
  /**
   * Mark request `reqId` as abandoned by its client.
   *
   * @returns its worker-side id, to cancel there; undefined when it is not running
   */
  stop(reqId: number): string | undefined
  /** Whether the client of request `reqId` has gone. */
  stopped(reqId: number): boolean
}

export function useTrackedEndpointCalls(): TrackedEndpointCalls {
  const [running, setRunning] = useState(0)
  useSuppressUndoRedo(running > 0)
  const ids = useRef(new Map<number, string>())
  const gone = useRef(new Set<number>())

  const track = useCallback(async <T,>(reqId: number, id: string, body: () => Promise<T>): Promise<T> => {
    ids.current.set(reqId, id)
    setRunning((n) => n + 1)
    try {
      return await body()
    } finally {
      ids.current.delete(reqId)
      gone.current.delete(reqId)
      setRunning((n) => n - 1)
    }
  }, [])

  const stop = useCallback((reqId: number): string | undefined => {
    const id = ids.current.get(reqId)
    if (id !== undefined) gone.current.add(reqId)
    return id
  }, [])

  const stopped = useCallback((reqId: number) => gone.current.has(reqId), [])

  return { track, stop, stopped }
}
