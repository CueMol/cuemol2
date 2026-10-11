/**
 * @file localApi.ts
 * @description The local API wire format as tritium_cli sees it: the info
 * file it finds the server through, the flag it launches the app with, and
 * the bodies of the requests it sends (`/console/*`, `/app/quit`).
 *
 * Types and constants only. The app re-exports these from
 * react-gui/src/shared/types/localApi.ts, next to the main <-> renderer half
 * of the contract that only the app uses.
 */

/** An endpoint the server can offer; each is switched on by its plugin. */
export type LocalApiEndpoint = 'mcp' | 'console'

/** The contents of `LocalApiStatus.infoFile`, while the server listens. */
export interface LocalApiInfoFile {
  port: number
  token: string
  pid: number
  endpoints: LocalApiEndpoint[]
}

/**
 * The argument `tritium_cli` launches the app with. An app started with it,
 * or a running app whose second instance is, opens the console endpoint for
 * the rest of its run whatever the Command line access setting says: the user
 * asked for it by running the command, and the setting itself is left alone.
 */
export const TRITIUM_CLI_FLAG = '--tritium-cli'

// --- The console endpoint's wire format ---

export type ConsoleDialectId = 'native' | 'pymol'

/** One transcript line, as the panel shows it. */
export interface ConsoleWireEntry {
  kind: 'echo' | 'output' | 'warning' | 'error'
  text: string
}

/** `POST /console/run`. */
export interface ConsoleRunRequest {
  dialect: ConsoleDialectId
  /** One command, several joined by `;`, or a script's lines. */
  text: string
  /** The client's working directory, absolute. */
  cwd: string
}

export interface ConsoleRunResponse {
  entries: ConsoleWireEntry[]
  /** A failure, or a cancel, kept the rest from running. */
  aborted: boolean
  interrupted: boolean
  /** Where `cd` left the directory. */
  cwd: string
}

/** `POST /console/complete`. */
export interface ConsoleCompleteRequest {
  dialect: ConsoleDialectId
  /** The line typed so far. */
  line: string
  cwd: string
}

export interface ConsoleCompleteResponse {
  /** The whole line, rewritten; null leaves it alone. */
  replacement: string | null
  /** A candidate list to print, or the line saying there was nothing. */
  messages: ConsoleWireEntry[]
}

/** `POST /console/info` (empty body): what the client shows in its banner. */
export interface ConsoleInfoResponse {
  /** libcuemol2's version and build, as in About. */
  version: string
  build: string
}

/** `POST /app/quit`: quit the app, as its Quit menu item does. */
export interface AppQuitRequest {
  /** Skip the save prompts: unsaved changes are lost. */
  force: boolean
}

export interface AppQuitResponse {
  /** `cancelled`: the user answered Cancel to a save prompt, and the app runs on. */
  outcome: 'quit' | 'cancelled'
}
