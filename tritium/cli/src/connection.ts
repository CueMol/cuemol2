/**
 * @file connection.ts
 * @description How tritium_cli finds and talks to the app: the info file the
 * app writes while its local API server is up, starting the app when none
 * answers, and the authenticated POST every request goes through.
 *
 * Kept apart from the entry module so a test can import it without the
 * command line running.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { TRITIUM_CLI_FLAG } from '@cuemol/console-kit'
import type { AppQuitResponse, LocalApiInfoFile } from '@cuemol/console-kit'

/** Where the app writes its port and token. */
export function infoFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.CUEMOL_LOCAL_API_INFO || path.join(os.homedir(), '.cuemol', 'local-api.json')
}

export const NOT_RUNNING =
  'CueMol is not running, or command line access is off ' +
  '(Settings > Plugins > Console > Command line access).'

/** The connection info, or an Error saying why there is none. */
export function readInfo(file = infoFilePath()): LocalApiInfoFile | Error {
  let info: LocalApiInfoFile
  try {
    info = JSON.parse(fs.readFileSync(file, 'utf8')) as LocalApiInfoFile
  } catch {
    return new Error(NOT_RUNNING)
  }
  if (!Array.isArray(info.endpoints) || !info.endpoints.includes('console')) return new Error(NOT_RUNNING)
  return info
}

/** Whether process `pid` is alive (EPERM: alive, but someone else's). */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Info for a live app with the console endpoint open, or null. */
function liveInfo(file: string): LocalApiInfoFile | null {
  const info = readInfo(file)
  if (info instanceof Error) return null
  // A crashed app leaves its file behind.
  if (typeof info.pid === 'number' && !alive(info.pid)) return null
  return info
}

const START_TIMEOUT_MS = 90_000

/** Starts a program that outlives this process. */
export type Launch = (command: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string) => void

function spawnDetached(command: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string): void {
  spawn(command, args, { detached: true, stdio: 'ignore', env, cwd }).unref()
}

/**
 * The command that starts the app, or null when this process cannot start one.
 *
 * Two ways: run by the app's own executable (the shipped wrapper sets
 * ELECTRON_RUN_AS_NODE), where `execPath` is the app; or from the repo through
 * `task run_tritium_cli`, which names the react-gui directory in
 * TRITIUM_CLI_DEV_APP, where the built dev app is started the way
 * `pnpm run start` starts it (without rebuilding). electron-vite hands what
 * follows `--` to the app.
 */
function launchCommand(env: NodeJS.ProcessEnv, execPath: string): { command: string; args: string[]; cwd?: string } | null {
  if (env.ELECTRON_RUN_AS_NODE) return { command: execPath, args: [TRITIUM_CLI_FLAG] }
  if (env.TRITIUM_CLI_DEV_APP) {
    return {
      command: 'pnpm',
      args: ['exec', 'electron-vite', 'preview', '--skipBuild', '--', TRITIUM_CLI_FLAG],
      cwd: env.TRITIUM_CLI_DEV_APP,
    }
  }
  return null
}

export interface EnsureAppOptions {
  env?: NodeJS.ProcessEnv
  execPath?: string
  file?: string
  launch?: Launch
  onStart?: () => void
  timeoutMs?: number
  pollMs?: number
}

/**
 * Make sure an app with command line access is there, starting one if not.
 *
 * An app that is running with access off gets the same launch; the second
 * instance hands its arguments to the running one and exits, and the running
 * one opens access. The started app outlives this process.
 *
 * Resolves when the console endpoint is in the info file; rejects with an
 * Error saying why not.
 */
export async function ensureApp({
  env = process.env,
  execPath = process.execPath,
  file = infoFilePath(env),
  launch = spawnDetached,
  onStart = () => process.stderr.write('Starting CueMol3...\n'),
  timeoutMs = START_TIMEOUT_MS,
  pollMs = 300,
}: EnsureAppOptions = {}): Promise<void> {
  if (liveInfo(file)) return
  const how = launchCommand(env, execPath)
  if (!how) throw new Error(NOT_RUNNING)
  const appEnv = { ...env }
  delete appEnv.ELECTRON_RUN_AS_NODE
  delete appEnv.TRITIUM_CLI_DEV_APP
  onStart()
  launch(how.command, how.args, appEnv, how.cwd)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs))
    if (liveInfo(file)) return
  }
  throw new Error('CueMol3 did not open command line access in time (is the Console plugin turned off?).')
}

/**
 * POST `body` to `route` and return the parsed answer.
 *
 * The info file is read per request: the app may have moved to another port
 * or made a new token since the last one.
 *
 * @param notFound - what a 404 means for this route; by default the console
 *   endpoint is off, which reads as "not running"
 */
export async function post<T = Record<string, unknown>>(
  route: string,
  body: unknown,
  signal?: AbortSignal,
  notFound = NOT_RUNNING,
): Promise<T> {
  const info = readInfo()
  if (info instanceof Error) throw info
  let res: Response
  try {
    res = await fetch(`http://127.0.0.1:${info.port}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${info.token}` },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error(NOT_RUNNING)
  }
  const answer = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (res.status === 404) throw new Error(notFound)
  if (!res.ok) throw new Error(answer.error || `The app answered ${res.status}.`)
  return answer
}

/**
 * Ask the app to quit, and say how it ended.
 *
 * A normal quit is answered once the user has gone through the save prompts.
 * The connection can also drop as the app goes down before the answer gets
 * out; an app whose process is gone has quit whatever the socket said.
 */
export async function quitApp(force: boolean, signal?: AbortSignal): Promise<AppQuitResponse['outcome']> {
  const info = readInfo()
  if (info instanceof Error) throw info
  try {
    const res = await post<AppQuitResponse>(
      '/app/quit',
      { force },
      signal,
      'This CueMol cannot be quit from the command line; update it.',
    )
    return res.outcome
  } catch (e) {
    if (signal?.aborted || (e as Error).message !== NOT_RUNNING) throw e
    for (let i = 0; i < 50; i++) {
      if (!alive(info.pid)) return 'quit'
      await new Promise((r) => setTimeout(r, 100))
    }
    throw e
  }
}
