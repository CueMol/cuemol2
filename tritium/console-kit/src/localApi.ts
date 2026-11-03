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

import type { CompletionCandidate } from './completion'

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

/**
 * TRITIUM_CLI_FLAG asking for the MCP endpoint as well (`tritium_cli mcp`).
 * The MCP plugin is mounted for that run even when it is switched off, and
 * its settings are left alone, as for the console.
 */
export const TRITIUM_CLI_MCP_FLAG = `${TRITIUM_CLI_FLAG}=mcp`

/** The endpoints a launch with `arg` asks for; empty when it is not one of the flags. */
export function cliFlagEndpoints(arg: string): LocalApiEndpoint[] {
  if (arg === TRITIUM_CLI_FLAG) return ['console']
  if (arg === TRITIUM_CLI_MCP_FLAG) return ['console', 'mcp']
  return []
}

// --- The console endpoint's wire format ---

/**
 * A dialect's id. Which ones exist is the app's to say (`/console/info`):
 * a client keeps no list of its own.
 */
export type ConsoleDialectId = string

/** One dialect, as `/console/info` describes it. */
export interface ConsoleDialectInfo {
  id: ConsoleDialectId
  /** Its name in messages ("Switched to the PyMOL dialect"). */
  label: string
  /** The app's prompt for it (`PyM>`). */
  prompt: string
  /**
   * Its script files, by extension (`.pml`). `text`: send what the file says
   * as `text`; `path`: send the path alone as `scriptPath` (the app reads it).
   */
  scripts: { ext: string; submit: 'text' | 'path' }[]
  /** The colour of its name in the client's prompt (an ANSI colour name). */
  cliColor: string
}

/** One transcript line, as the panel shows it. */
export interface ConsoleWireEntry {
  kind: 'echo' | 'output' | 'warning' | 'error'
  text: string
  /** `markdown`: the text is Markdown (help) to be formatted (markdown.ts); else plain lines. */
  format?: 'markdown'
}

/** `POST /console/run`. */
export interface ConsoleRunRequest {
  dialect: ConsoleDialectId
  /** One command, several joined by `;`, or a script's lines. Absent with `scriptPath`. */
  text?: string
  /**
   * A script file to run, absolute, in place of `text`: one the dialect
   * declares `submit: 'path'`. Since protocol 3.
   */
  scriptPath?: string
  /** The client's working directory, absolute. */
  cwd: string
  /**
   * The edit lock this run belongs to (`/console/lock`). Absent, the run
   * takes the lock for itself while it lasts.
   */
  lock?: string
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
  /** Why there was nothing to complete; candidates are not printed here. */
  messages: ConsoleWireEntry[]
  /** Two or more candidates, for the client to list and walk (completion.ts). */
  candidates?: CompletionCandidate[]
}

/**
 * The console endpoint's wire revision. tritium_cli is also installed from
 * npm, apart from the app, so the two can be from different releases; raise
 * this when a change to the bodies above breaks an older client or app.
 */
export const CONSOLE_PROTOCOL = 3

/**
 * `POST /console/lock`: hold the edit lock across several runs, so that no
 * other client edits or switches scenes between them. `owner` is the
 * client's own random id, sent again as `ConsoleRunRequest.lock`.
 */
export interface ConsoleLockRequest {
  action: 'acquire' | 'release'
  owner: string
}

/** What a client turned away by the edit lock is told (409, or an MCP tool result). */
export const EDIT_LOCK_BUSY_MESSAGE =
  'CueMol is busy: another command line client is using it. Try again when it has finished.'

/** `POST /console/info` (empty body): what the client shows in its banner. */
export interface ConsoleInfoResponse {
  /** libcuemol2's version and build, as in About. */
  version: string
  build: string
  /** CONSOLE_PROTOCOL of the app; absent from apps that predate it. */
  protocol?: number
  /** The dialects the app speaks, in its order. Since protocol 3. */
  dialects?: ConsoleDialectInfo[]
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
