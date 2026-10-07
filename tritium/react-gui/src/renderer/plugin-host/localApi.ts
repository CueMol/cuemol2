/**
 * @file plugin-host/localApi.ts
 * @description The plugin side of main's local API server: owning an
 * endpoint, and reading or changing the server's state.
 *
 * Main owns the socket and the token; a plugin owns what an endpoint means.
 * `useLocalApiEndpoint` is the whole contract for the second half: while the
 * hook is mounted (and asked to be on) the endpoint is open, each request
 * for it arrives at `handle`, and whatever `handle` resolves to is the reply.
 * Mounting it in the plugin's `Root` ties the endpoint to the plugin being
 * enabled without main ever reading plugin settings.
 */

import { useEffect, useRef, useState } from 'react'
import { IPC } from '@shared/ipcChannels'
import type { LocalApiControlReq, LocalApiEndpoint, LocalApiStatus } from '@shared/types/localApi'

/** One request for an endpoint, as its owner receives it. */
export interface LocalApiCall {
  /** Unique while the app runs; also what a later `cancel` names. */
  reqId: number
  kind: string
  payload: unknown
}

export interface LocalApiEndpointHandlers {
  /** Answer a request. A throw is replied as `{ error }`. */
  handle(call: LocalApiCall): Promise<unknown>
  /** The caller of request `reqId` went away: stop working on it. */
  cancel(reqId: number): void
}

const statusListeners = new Set<(s: LocalApiStatus) => void>()

function publish(s: LocalApiStatus | undefined): LocalApiStatus | null {
  if (!s) return null
  for (const l of statusListeners) l(s)
  return s
}

/** Change the server (endpoint on/off, token, port); resolves to its new state. */
export async function controlLocalApi(req: LocalApiControlReq): Promise<LocalApiStatus | null> {
  return publish(await window.electronAPI?.invoke(IPC.LOCAL_API_CONTROL, req))
}

/** The server's state, kept current while mounted. Null outside the app. */
export function useLocalApiStatus(): LocalApiStatus | null {
  const [status, setStatus] = useState<LocalApiStatus | null>(null)
  useEffect(() => {
    let live = true
    const listener = (s: LocalApiStatus) => { if (live) setStatus(s) }
    statusListeners.add(listener)
    void window.electronAPI?.invoke(IPC.LOCAL_API_STATUS).then((s) => { if (live && s) setStatus(s) })
    return () => {
      live = false
      statusListeners.delete(listener)
    }
  }, [])
  return status
}

/**
 * Own `endpoint` while mounted and `enabled`.
 *
 * @param handlers - read through a ref, so a new object each render neither
 *   reopens the endpoint nor drops a request in flight.
 */
export function useLocalApiEndpoint(
  endpoint: LocalApiEndpoint,
  enabled: boolean,
  handlers: LocalApiEndpointHandlers,
): void {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const api = window.electronAPI
    if (!api || !enabled) return
    void controlLocalApi({ action: 'endpoint', endpoint, enabled: true })
    const off = api.onPush(IPC.LOCAL_API_REQUEST, (p) => {
      if (p.endpoint !== endpoint) return
      if (p.kind === 'cancel') {
        const target = (p.payload as { target?: unknown } | null)?.target
        if (typeof target === 'number') ref.current.cancel(target)
        return
      }
      void (async () => {
        let res: unknown
        try {
          res = await ref.current.handle({ reqId: p.reqId, kind: p.kind, payload: p.payload })
        } catch (e) {
          res = { error: e instanceof Error ? e.message : String(e) }
        }
        await api.invoke(IPC.LOCAL_API_REPLY, { reqId: p.reqId, res })
      })()
    })
    return () => {
      off()
      void controlLocalApi({ action: 'endpoint', endpoint, enabled: false })
    }
  }, [endpoint, enabled])
}
