/**
 * @file main/localApi/relay.ts
 * @description Correlation-id round trip from the local API server to the
 * main window and back.
 *
 * The same shape as the Rendering window's relay (`ipc/windowRelay.ts`): a
 * push out with a request id, an invoke back with the same id. It differs in
 * what a call may take and what giving up means. A tool call can render for
 * minutes, so the timeout is long; and a caller that disconnects is told to
 * the window as a `cancel` request, so the work stops instead of running on
 * for nobody.
 */

import type { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type {
  LocalApiEndpoint, LocalApiReplyPayload, LocalApiRequestPayload,
} from '@shared/types/localApi'

/** Longest a request may wait for the window: a long ray-traced render. */
export const LOCAL_API_TIMEOUT_MS = 30 * 60 * 1000

export interface LocalApiRelay {
  /**
   * Ask the main window. Rejects when there is no window, when it does not
   * answer in time, or when the window goes away first. Aborting `signal`
   * sends a `cancel` for the request; the answer that follows is still
   * delivered.
   */
  request(endpoint: LocalApiEndpoint, kind: string, payload: unknown, signal?: AbortSignal): Promise<unknown>
  /** Deliver the window's answer. One for an unknown id is dropped. */
  reply(p: LocalApiReplyPayload): void
  /** Fail everything still waiting (the window closed). */
  failAll(reason: string): void
}

/**
 * Create the relay.
 *
 * @param target - the window that answers, looked up per request because it
 *   can be created after the server
 */
export function makeLocalApiRelay(
  target: () => BrowserWindow | null,
  timeoutMs: number = LOCAL_API_TIMEOUT_MS,
): LocalApiRelay {
  let nextReqId = 1
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  function send(win: BrowserWindow, p: LocalApiRequestPayload): void {
    win.webContents.send(IPC.LOCAL_API_REQUEST, p)
  }

  return {
    request(endpoint, kind, payload, signal) {
      const win = target()
      if (!win || win.isDestroyed()) return Promise.reject(new Error('The CueMol window is not open.'))
      const reqId = nextReqId++
      return new Promise<unknown>((resolve, reject) => {
        const onAbort = () => {
          const w = target()
          if (w && !w.isDestroyed()) {
            send(w, { reqId: nextReqId++, endpoint, kind: 'cancel', payload: { target: reqId } })
          }
        }
        const done = () => {
          clearTimeout(timer)
          pending.delete(reqId)
          signal?.removeEventListener('abort', onAbort)
        }
        const timer = setTimeout(() => {
          done()
          reject(new Error('CueMol did not answer in time.'))
        }, timeoutMs)
        pending.set(reqId, {
          resolve: (v) => { done(); resolve(v) },
          reject: (e) => { done(); reject(e) },
        })
        signal?.addEventListener('abort', onAbort, { once: true })
        send(win, { reqId, endpoint, kind, payload })
      })
    },

    reply(p) {
      pending.get(p.reqId)?.resolve(p.res)
    },

    failAll(reason) {
      for (const { reject } of [...pending.values()]) reject(new Error(reason))
    },
  }
}
