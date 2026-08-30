/**
 * @file main/ipc/windowRelay.ts
 * @description Correlation-id round trip from the Rendering window to the
 * main window and back.
 *
 * The Rendering window has no CueMol worker, so a handful of its questions
 * (canvas size, target-view camera, hatch style spec) can only be answered by
 * the main window. Each one is a push out plus an invoke back, correlated by
 * a request id, with a timeout so a main window that never answers -- busy,
 * navigating, gone -- fails the call rather than hanging it.
 *
 * There is one relay for every kind in `RelayKinds`: the machinery is
 * identical and only the payloads and the give-up value differ, so those are
 * the two things a kind supplies.
 */

import type { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type {
  RelayKind, RelayReplyPayload, RelayReq, RelayRes,
} from '@shared/types/renderWindow'

/** How long to wait for the main window before giving up on a question. */
const RELAY_TIMEOUT_MS = 2000

/**
 * What to resolve with when no answer arrives. `unavailable` is the main
 * window being unusable before the question goes out; `timeout` is it not
 * answering in time. They are separate because a caller that reports the
 * reason (the hatch editor) tells the two apart.
 */
interface Fallbacks<K extends RelayKind> {
  unavailable: () => RelayRes<K>
  timeout: () => RelayRes<K>
}

/** Give-up values, one entry per kind. */
const FALLBACKS: { [K in RelayKind]: Fallbacks<K> } = {
  viewSize: { unavailable: () => null, timeout: () => null },
  viewCamera: { unavailable: () => null, timeout: () => null },
  hatchStyle: {
    unavailable: () => ({ ok: false, error: 'main window unavailable' }),
    timeout: () => ({ ok: false, error: 'timeout' }),
  },
}

export interface WindowRelay {
  /** Ask the main window; resolves with its answer or the kind's fallback. */
  request<K extends RelayKind>(kind: K, req: RelayReq<K>): Promise<RelayRes<K>>
  /** Deliver the main window's answer. A reply for an id that already timed
   *  out (or was never asked) is dropped. */
  reply(payload: RelayReplyPayload): void
}

/**
 * Create the relay for one target window.
 *
 * @param target - the window that answers; questions fail fast once destroyed
 * @param timeoutMs - how long to wait for an answer
 */
export function makeWindowRelay(
  target: BrowserWindow,
  timeoutMs: number = RELAY_TIMEOUT_MS,
): WindowRelay {
  let nextReqId = 1
  // Untyped inside: the map holds settlers for every kind at once, and each
  // one is only ever called with the response type its own request declared.
  const pending = new Map<number, (res: never) => void>()

  return {
    request<K extends RelayKind>(kind: K, req: RelayReq<K>): Promise<RelayRes<K>> {
      const fb = FALLBACKS[kind]
      if (target.isDestroyed()) return Promise.resolve(fb.unavailable())
      const reqId = nextReqId++
      return new Promise<RelayRes<K>>((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(reqId)
          resolve(fb.timeout())
        }, timeoutMs)
        pending.set(reqId, ((res: RelayRes<K>) => {
          clearTimeout(timer)
          pending.delete(reqId)
          resolve(res)
        }) as (res: never) => void)
        target.webContents.send(IPC.RENDER_RELAY_REQUEST, { kind, reqId, req } as never)
      })
    },

    reply(payload: RelayReplyPayload): void {
      pending.get(payload.reqId)?.(payload.res as never)
    },
  }
}
