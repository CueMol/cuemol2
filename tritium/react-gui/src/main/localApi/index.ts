/**
 * @file main/localApi/index.ts
 * @description Wires the local API server into the app: its token and port,
 * its endpoints, and the channels the main window drives it through.
 *
 * The server starts closed. A plugin that owns an endpoint switches it on
 * from the renderer (`LOCAL_API_CONTROL`), which is how a plugin that is off
 * keeps its endpoint closed: main never reads the plugin settings itself.
 */

import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as nodePath from 'path'
import { randomBytes } from 'crypto'
import { IPC } from '@shared/ipcChannels'
import { DEFAULT_LOCAL_API_PORT, TRITIUM_CLI_FLAG } from '@shared/types/localApi'
import { handleInvoke } from '../ipc/handleInvoke'
import { secretId } from '../secretStore'
import { saveSecretEnc } from '../stateStore'
import { getMainWindow } from '../windows/mainWindow'
import { quitApp } from '../appQuit'
import { appEndpoint } from './appEndpoint'
import { consoleEndpoint } from './consoleEndpoint'
import { mcpEndpoint } from './mcpEndpoint'
import { makeLocalApiRelay } from './relay'
import { createLocalApiServer } from './server'
import type { LocalApiServer } from './server'

/**
 * Where the token is kept between runs: a plain file readable by this user
 * only, under userData.
 *
 * Not in `safeStorage`: the same token is written in the clear to the info
 * file (`localApiInfoFile`, also 0600) for the command line to read, so
 * encrypting this copy protected nothing, while reading it at every launch
 * raised the macOS Keychain password prompt -- after every update of the
 * ad-hoc-signed app, since the Keychain trusts one build's signature.
 */
function tokenFile(): string {
  return nodePath.join(app.getPath('userData'), 'local-api-token')
}

/** The token the app kept in `safeStorage` before; dropped unread. */
const LEGACY_TOKEN_REF = { namespace: 'localApi', key: 'token' } as const

/**
 * Where a command-line client finds the port and token. In the home
 * directory rather than userData, so a client needs no knowledge of the
 * app's name or of how it was launched; overridable for a second instance.
 */
export function localApiInfoFile(): string {
  return process.env.CUEMOL_LOCAL_API_INFO || nodePath.join(os.homedir(), '.cuemol', 'local-api.json')
}

let token = ''

/** The stored token, or a new one. */
function loadToken(): string {
  // Removing the old encrypted entry needs no decryption, so no prompt.
  saveSecretEnc(secretId(LEGACY_TOKEN_REF), null)
  try {
    const stored = fs.readFileSync(tokenFile(), 'utf8').trim()
    if (stored) return stored
  } catch {
    // First run: no file yet.
  }
  return newToken()
}

function newToken(): string {
  const t = randomBytes(32).toString('base64url')
  try {
    fs.writeFileSync(tokenFile(), t, { mode: 0o600 })
  } catch (e) {
    console.warn('[localApi] token kept for this session only:', e)
  }
  return t
}

let server: LocalApiServer | null = null

/** Whether tritium_cli launched this run of the app (or a second instance of it). */
let cliAccess = false

/**
 * Note a command line that carries TRITIUM_CLI_FLAG. Called with the app's own
 * argv before any window exists (the window asks later) and with a second
 * instance's (the window is told). Never turned back off for the run.
 */
export function noteCliLaunch(argv: readonly string[]): void {
  if (cliAccess || !argv.includes(TRITIUM_CLI_FLAG)) return
  cliAccess = true
  getMainWindow()?.webContents.send(IPC.LOCAL_API_CLI_ACCESS_GRANTED)
}

/** Register the local API channels; the server is created closed. */
export function registerLocalApiHandlers(mainWindow: BrowserWindow): void {
  token = loadToken()
  const relay = makeLocalApiRelay(() => getMainWindow() ?? mainWindow)
  server = createLocalApiServer({
    handlers: [mcpEndpoint(relay, app.getVersion()), consoleEndpoint(relay), appEndpoint(quitApp)],
    token: () => token,
    // The owning plugin sends its stored port before switching an endpoint on.
    port: DEFAULT_LOCAL_API_PORT,
    infoFile: localApiInfoFile(),
  })
  const srv = server

  handleInvoke(IPC.LOCAL_API_REPLY, (_e, p) => relay.reply(p))
  handleInvoke(IPC.LOCAL_API_STATUS, () => srv.status())
  handleInvoke(IPC.LOCAL_API_CLI_ACCESS, () => cliAccess)
  handleInvoke(IPC.LOCAL_API_CONTROL, async (_e, req) => {
    switch (req.action) {
      case 'endpoint':
        return srv.setEndpoint(req.endpoint, req.enabled)
      case 'regenerateToken':
        token = newToken()
        return srv.refresh()
      case 'setPort':
        if (!Number.isInteger(req.port) || req.port < 1024 || req.port > 65535) return srv.status()
        return srv.setPort(req.port)
    }
  })

  // A window that goes away cannot answer what it was asked.
  mainWindow.on('closed', () => relay.failAll('The CueMol window was closed.'))
}

/** Close the server and remove the info file (app quit). */
export async function stopLocalApi(): Promise<void> {
  await server?.stop()
}
