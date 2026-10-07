/**
 * @file shared/types/localApi.ts
 * @description The contract between main's local API server and the
 * renderer that answers its requests.
 *
 * The server (127.0.0.1 only, bearer token) offers endpoints to programs on
 * the same machine: an MCP server for AI clients and a command line for the
 * console. Main owns the socket and the token but knows nothing about the
 * scene, so every request it accepts is pushed to the main window, handled
 * there by the plugin that owns the endpoint, and answered by an invoke
 * carrying the same request id.
 *
 * Types only: nothing in shared/types/ may import main/ or renderer/ code.
 */

/** An endpoint the server can offer; each is switched on by its plugin. */
export type LocalApiEndpoint = 'mcp' | 'console'

/** One request for the renderer to answer (main -> main window). */
export interface LocalApiRequestPayload {
  reqId: number
  endpoint: LocalApiEndpoint
  /**
   * What is asked, in the endpoint's own vocabulary (`listTools`,
   * `callTool`, `run`, ...). `cancel` is common to all: the caller of request
   * `payload.target` went away, so stop working on it. A cancel is never
   * replied to.
   */
  kind: string
  payload: unknown
}

/** The renderer's answer to request `reqId` (main window -> main). */
export interface LocalApiReplyPayload {
  reqId: number
  res: unknown
}

/** Switch an endpoint on or off, or make a new token. */
export type LocalApiControlReq =
  | { action: 'endpoint'; endpoint: LocalApiEndpoint; enabled: boolean }
  | { action: 'regenerateToken' }
  | { action: 'setPort'; port: number }

/** What the server is doing. */
export interface LocalApiStatus {
  /** Whether it is accepting connections. */
  listening: boolean
  port: number
  /** The endpoints switched on; the server listens while there is any. */
  endpoints: LocalApiEndpoint[]
  /** The bearer token clients must send. */
  token: string
  /** Why it is not listening although an endpoint is on (port in use, ...). */
  error: string | null
  /** The file a command-line client reads the port and token from. */
  infoFile: string
}

/** The contents of `LocalApiStatus.infoFile`, while the server listens. */
export interface LocalApiInfoFile {
  port: number
  token: string
  pid: number
  endpoints: LocalApiEndpoint[]
}

/** The port used until one is chosen. */
export const DEFAULT_LOCAL_API_PORT = 27182
