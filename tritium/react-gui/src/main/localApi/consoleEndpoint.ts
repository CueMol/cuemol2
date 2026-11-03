/**
 * @file main/localApi/consoleEndpoint.ts
 * @description The console endpoint (`/console/run`, `/console/complete`,
 * `/console/info`, `/console/lock`): what the `tritium_cli` command line sends.
 *
 * Plain JSON in, plain JSON out. The body is checked for shape here and
 * relayed to the main window, where the console plugin runs it exactly as a
 * line typed into the panel. A client that disconnects mid-run (Ctrl-C)
 * cancels the run, which is the panel's Stop.
 *
 * Runs go through the edit lock (editLock.ts), answered here in main:
 * `/console/lock` holds it across several runs, and a run while another
 * client holds it is turned away with 409.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import * as nodePath from 'path'
import { EDIT_LOCK_BUSY_MESSAGE } from '@shared/types/localApi'
import type { ConsoleCompleteRequest, ConsoleLockRequest, ConsoleRunRequest } from '@shared/types/localApi'
import type { EditLock } from './editLock'
import { relayed, RelayedError } from './relay'
import type { LocalApiRelay } from './relay'
import { send } from './server'
import type { EndpointHandler } from './server'

export const CONSOLE_RUN_PATH = '/console/run'
export const CONSOLE_COMPLETE_PATH = '/console/complete'
export const CONSOLE_INFO_PATH = '/console/info'
export const CONSOLE_LOCK_PATH = '/console/lock'

/** The lock request, if `body` is one; else why not. */
function readLockRequest(body: unknown): ConsoleLockRequest | string {
  const b = (body ?? {}) as Record<string, unknown>
  if (b.action !== 'acquire' && b.action !== 'release') return 'action must be "acquire" or "release".'
  if (typeof b.owner !== 'string' || b.owner === '') return 'owner must be a non-empty string.'
  return { action: b.action, owner: b.owner }
}

/** The request, if `body` is one; else why not. */
function readConsoleRequest(
  path: string,
  body: unknown,
): ConsoleRunRequest | ConsoleCompleteRequest | Record<string, never> | string {
  if (!body || typeof body !== 'object') return 'The body must be a JSON object.'
  if (path === CONSOLE_INFO_PATH) return {}
  const b = body as Record<string, unknown>
  // Which dialects exist is the window's to say; it turns an unknown one away.
  if (typeof b.dialect !== 'string' || b.dialect === '') return 'dialect must be a non-empty string.'
  if (typeof b.cwd !== 'string' || !nodePath.isAbsolute(b.cwd)) return 'cwd must be an absolute path.'
  if (path === CONSOLE_RUN_PATH) {
    if (b.lock !== undefined && (typeof b.lock !== 'string' || b.lock === '')) return 'lock must be a non-empty string.'
    const lock = b.lock !== undefined ? { lock: b.lock } : {}
    if (b.scriptPath !== undefined) {
      if (typeof b.scriptPath !== 'string' || !nodePath.isAbsolute(b.scriptPath)) return 'scriptPath must be an absolute path.'
      if (b.text !== undefined) return 'give text or scriptPath, not both.'
      return { dialect: b.dialect, scriptPath: b.scriptPath, cwd: b.cwd, ...lock }
    }
    if (typeof b.text !== 'string') return 'text must be a string.'
    return { dialect: b.dialect, text: b.text, cwd: b.cwd, ...lock }
  }
  if (typeof b.line !== 'string') return 'line must be a string.'
  return { dialect: b.dialect, line: b.line, cwd: b.cwd }
}

/**
 * Create the endpoint.
 *
 * @param lock - the edit lock, shared with the MCP endpoint
 */
export function consoleEndpoint(relay: LocalApiRelay, lock: EditLock): EndpointHandler {
  return {
    endpoint: 'console',
    paths: [CONSOLE_RUN_PATH, CONSOLE_COMPLETE_PATH, CONSOLE_INFO_PATH, CONSOLE_LOCK_PATH],
    async handle(req: IncomingMessage, res: ServerResponse, body: unknown) {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' }).end()
        return
      }
      const path = (req.url ?? '').split('?')[0]
      if (path === CONSOLE_LOCK_PATH) {
        const l = readLockRequest(body)
        if (typeof l === 'string') return send(res, 400, { error: l })
        if (l.action === 'release') {
          lock.release(l.owner)
          return send(res, 200, {})
        }
        return lock.acquire(l.owner) ? send(res, 200, {}) : send(res, 409, { error: EDIT_LOCK_BUSY_MESSAGE })
      }
      const request = readConsoleRequest(path, body)
      if (typeof request === 'string') return send(res, 400, { error: request })

      // Only a run edits; completion and info read.
      let end = () => {}
      if (path === CONSOLE_RUN_PATH) {
        const run = request as ConsoleRunRequest
        const entered = lock.enter(run.lock)
        if (!entered) return send(res, 409, { error: EDIT_LOCK_BUSY_MESSAGE })
        end = entered
        // The lock is main's business; the window gets the run as before.
        delete run.lock
      }

      const ac = new AbortController()
      res.on('close', () => { if (!res.writableEnded) ac.abort() })
      const kind = path === CONSOLE_RUN_PATH ? 'run' : path === CONSOLE_INFO_PATH ? 'info' : 'complete'
      try {
        send(res, 200, await relayed(relay, 'console', kind, request, ac.signal))
      } catch (e) {
        if (e instanceof RelayedError) return send(res, 409, { error: e.message })
        send(res, 503, { error: e instanceof Error ? e.message : 'The CueMol window did not answer.' })
      } finally {
        end()
      }
    },
  }
}
