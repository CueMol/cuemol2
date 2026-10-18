/**
 * @file main/localApi/server.ts
 * @description The local API server: one HTTP listener on 127.0.0.1 that
 * every endpoint (MCP, the console command line) shares.
 *
 * What is common to the endpoints is done here, once: who may connect (the
 * bearer token), which pages may reach it (the Origin and Host checks), and
 * when it listens at all (while at least one endpoint is switched on). An
 * endpoint only says which paths it answers and how.
 *
 * While listening, the port and token are written to an info file readable
 * only by the user, so a command-line client on the same account connects
 * without anything being pasted.
 *
 * No Electron import: the server is plain Node, which keeps it testable.
 */

import * as fs from 'fs'
import * as http from 'http'
import * as nodePath from 'path'
import { timingSafeEqual } from 'crypto'
import type { LocalApiEndpoint, LocalApiInfoFile, LocalApiStatus } from '@shared/types/localApi'

/** Largest request body accepted, in bytes. */
const MAX_BODY_BYTES = 4 * 1024 * 1024

/** One endpoint: the paths it answers and how. */
export interface EndpointHandler {
  endpoint: LocalApiEndpoint
  /** Exact request paths, without the query string. */
  paths: readonly string[]
  /**
   * Answer one authenticated request.
   *
   * @param body - the parsed JSON body of a POST, else undefined
   */
  handle(req: http.IncomingMessage, res: http.ServerResponse, body: unknown): Promise<void>
}

export interface LocalApiServerOptions {
  handlers: readonly EndpointHandler[]
  /** The token clients must present; read per request so a new one applies at once. */
  token: () => string
  port: number
  /** Where to write the connection info while listening; omitted writes none. */
  infoFile?: string
  /** Called whenever the status changes. */
  onStatus?: (s: LocalApiStatus) => void
}

export interface LocalApiServer {
  setEndpoint(endpoint: LocalApiEndpoint, enabled: boolean): Promise<LocalApiStatus>
  setPort(port: number): Promise<LocalApiStatus>
  /** Rewrite the info file, after the token changed. */
  refresh(): LocalApiStatus
  status(): LocalApiStatus
  /** Close the listener and remove the info file. */
  stop(): Promise<void>
}

/** Answer with a JSON body, unless the response has already gone or the client left. */
export function send(res: http.ServerResponse, code: number, body: unknown): void {
  if (res.headersSent || res.destroyed) return
  const text = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(text)
}

/**
 * Whether a browser page from `origin` may call. Only pages served from this
 * machine's loopback; any other site is refused so that a page the user
 * visits cannot drive CueMol through the browser (DNS rebinding).
 */
function originAllowed(origin: string | undefined): boolean {
  if (origin === undefined) return true
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin)
}

/** Whether the Host header names the loopback, for the same reason. */
function hostAllowed(host: string | undefined): boolean {
  if (host === undefined) return false
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)
}

/** Constant-time comparison of the presented token. */
function tokenMatches(header: string | undefined, token: string): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? '')
  if (!m || token === '') return false
  const a = Buffer.from(m[1].trim())
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') return resolve(undefined)
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error('The request body is not JSON.'))
      }
    })
    req.on('error', reject)
  })
}

/** Create the server; it does not listen until an endpoint is switched on. */
export function createLocalApiServer(opts: LocalApiServerOptions): LocalApiServer {
  const enabled = new Set<LocalApiEndpoint>()
  let port = opts.port
  let server: http.Server | null = null
  let listening = false
  let error: string | null = null

  function status(): LocalApiStatus {
    return {
      listening,
      port,
      endpoints: [...enabled].sort(),
      token: opts.token(),
      error,
      infoFile: opts.infoFile ?? '',
    }
  }

  function writeInfo(): void {
    if (!opts.infoFile) return
    try {
      if (!listening) {
        fs.rmSync(opts.infoFile, { force: true })
        return
      }
      const info: LocalApiInfoFile = { port, token: opts.token(), pid: process.pid, endpoints: [...enabled].sort() }
      fs.mkdirSync(nodePath.dirname(opts.infoFile), { recursive: true, mode: 0o700 })
      fs.writeFileSync(opts.infoFile, JSON.stringify(info, null, 2), { mode: 0o600 })
      fs.chmodSync(opts.infoFile, 0o600)
    } catch (e) {
      console.warn('[localApi] could not write the info file:', e)
    }
  }

  function changed(): LocalApiStatus {
    writeInfo()
    const s = status()
    opts.onStatus?.(s)
    return s
  }

  async function onRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!hostAllowed(req.headers.host) || !originAllowed(req.headers.origin)) {
      return send(res, 403, { error: 'Forbidden origin.' })
    }
    if (!tokenMatches(req.headers.authorization, opts.token())) {
      return send(res, 401, { error: 'Missing or wrong bearer token.' })
    }
    const path = (req.url ?? '/').split('?')[0]
    const handler = opts.handlers.find((h) => enabled.has(h.endpoint) && h.paths.includes(path))
    if (!handler) return send(res, 404, { error: `Nothing is served at ${path}.` })
    let body: unknown
    if (req.method === 'POST') {
      try {
        body = await readBody(req)
      } catch (e) {
        return send(res, 400, { error: e instanceof Error ? e.message : 'Bad request.' })
      }
    }
    try {
      await handler.handle(req, res, body)
    } catch (e) {
      console.warn(`[localApi] ${path} failed:`, e)
      send(res, 500, { error: e instanceof Error ? e.message : 'Internal error.' })
    }
  }

  function listen(): Promise<void> {
    return new Promise((resolve) => {
      const s = http.createServer((req, res) => { void onRequest(req, res) })
      s.once('error', (e: NodeJS.ErrnoException) => {
        error = e.code === 'EADDRINUSE' ? `Port ${port} is in use by another program.` : e.message
        server = null
        listening = false
        resolve()
      })
      s.listen(port, '127.0.0.1', () => {
        server = s
        listening = true
        error = null
        resolve()
      })
    })
  }

  function close(): Promise<void> {
    const s = server
    server = null
    listening = false
    if (!s) return Promise.resolve()
    return new Promise((resolve) => {
      s.close(() => resolve())
      s.closeAllConnections()
    })
  }

  /** Listen while any endpoint is on; close when none is. */
  async function reconcile(): Promise<void> {
    if (enabled.size > 0 && !listening) await listen()
    else if (enabled.size === 0) {
      await close()
      error = null
    }
  }

  return {
    async setEndpoint(endpoint, on) {
      if (on) enabled.add(endpoint)
      else enabled.delete(endpoint)
      await reconcile()
      return changed()
    },
    async setPort(p) {
      if (p === port && (listening || enabled.size === 0)) return status()
      port = p
      await close()
      await reconcile()
      return changed()
    },
    refresh: changed,
    status,
    async stop() {
      enabled.clear()
      await close()
      writeInfo()
    },
  }
}
