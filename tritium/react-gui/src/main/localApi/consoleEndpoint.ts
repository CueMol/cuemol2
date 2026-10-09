/**
 * @file main/localApi/consoleEndpoint.ts
 * @description The console endpoint (`/console/run`, `/console/complete`,
 * `/console/info`): what the `tritium_cli` command line sends.
 *
 * Plain JSON in, plain JSON out. The body is checked for shape here and
 * relayed to the main window, where the console plugin runs it exactly as a
 * line typed into the panel. A client that disconnects mid-run (Ctrl-C)
 * cancels the run, which is the panel's Stop.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import * as nodePath from 'path'
import type { ConsoleCompleteRequest, ConsoleRunRequest } from '@shared/types/localApi'
import { relayed, RelayedError } from './relay'
import type { LocalApiRelay } from './relay'
import { send } from './server'
import type { EndpointHandler } from './server'

export const CONSOLE_RUN_PATH = '/console/run'
export const CONSOLE_COMPLETE_PATH = '/console/complete'
export const CONSOLE_INFO_PATH = '/console/info'

/** The request, if `body` is one; else why not. */
export function readConsoleRequest(
  path: string,
  body: unknown,
): ConsoleRunRequest | ConsoleCompleteRequest | Record<string, never> | string {
  if (!body || typeof body !== 'object') return 'The body must be a JSON object.'
  if (path === CONSOLE_INFO_PATH) return {}
  const b = body as Record<string, unknown>
  if (b.dialect !== 'native' && b.dialect !== 'pymol') return 'dialect must be "native" or "pymol".'
  if (typeof b.cwd !== 'string' || !nodePath.isAbsolute(b.cwd)) return 'cwd must be an absolute path.'
  if (path === CONSOLE_RUN_PATH) {
    if (typeof b.text !== 'string') return 'text must be a string.'
    return { dialect: b.dialect, text: b.text, cwd: b.cwd }
  }
  if (typeof b.line !== 'string') return 'line must be a string.'
  return { dialect: b.dialect, line: b.line, cwd: b.cwd }
}

export function consoleEndpoint(relay: LocalApiRelay): EndpointHandler {
  return {
    endpoint: 'console',
    paths: [CONSOLE_RUN_PATH, CONSOLE_COMPLETE_PATH, CONSOLE_INFO_PATH],
    async handle(req: IncomingMessage, res: ServerResponse, body: unknown) {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' }).end()
        return
      }
      const path = (req.url ?? '').split('?')[0]
      const request = readConsoleRequest(path, body)
      if (typeof request === 'string') return send(res, 400, { error: request })

      const ac = new AbortController()
      res.on('close', () => { if (!res.writableEnded) ac.abort() })
      const kind = path === CONSOLE_RUN_PATH ? 'run' : path === CONSOLE_INFO_PATH ? 'info' : 'complete'
      try {
        send(res, 200, await relayed(relay, 'console', kind, request, ac.signal))
      } catch (e) {
        if (e instanceof RelayedError) return send(res, 409, { error: e.message })
        send(res, 503, { error: e instanceof Error ? e.message : 'The CueMol window did not answer.' })
      }
    },
  }
}
