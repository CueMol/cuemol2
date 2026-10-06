/**
 * @file worker/server/catalog/op.ts
 * @description What an op is: one operation on the scene, declared once and
 * offered to every caller that drives CueMol by name.
 *
 * The AI agent sends an op to the model as a tool, the console makes commands
 * of it, and an MCP server would list it. Each of those is an adapter that
 * reads this declaration; none of them owns the op. `run` takes typed
 * arguments and calls the existing worker services, and knows nothing about
 * where its arguments came from.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { ArgsOf, ParamMap } from './params'

/** A picture an op hands back next to its data (a model can look at it). */
export interface OpImage {
  mediaType: 'image/png'
  /** The encoded file, base64. */
  base64: string
}

/**
 * What an op reports. `data` goes back to the caller as is; a failure carries
 * a reason the reader can act on.
 */
export type OpOutcome =
  | { ok: true; data?: unknown; image?: OpImage }
  | { ok: false; error: string }

/** Where an op runs, and what it may ask of its caller. */
export interface OpContext {
  sceneId: number
  viewId: number
  /** Unique to this call, e.g. for a temporary file name. */
  callId: string
  /** Note that the scene changed when `mutates` cannot say so statically. */
  markMutated(): void
  /**
   * Register a download's stream request id, so stopping the caller (a turn,
   * a console run) aborts it too. The id should come from `streamId`.
   */
  noteStream(reqId: string): void
  /** A stream request id unique to this call. */
  streamId(tag: string): string
}

/**
 * A second name an op answers to in a console, with some arguments fixed:
 * `enable` is `set_visible` with `visible` true.
 */
export interface OpVerb {
  verb: string
  /** Arguments the verb supplies; the user cannot give them. */
  fixed?: Readonly<Record<string, unknown>>
  /** Positional order for this verb, when the op's own order reads badly. */
  order?: readonly string[]
  /** One line for help; defaults to the op's first sentence. */
  summary?: string
}

/** Which callers see an op. */
export interface OpExposure {
  /** `core`: in the AI agent's tool list (and an MCP server's). */
  tool: 'core' | false
  /** Generated as a console command. */
  console: boolean
}

export interface Op<P extends ParamMap = ParamMap> {
  /** snake_case; the tool name and the console command name. Unique. */
  name: string
  /** What it does AND when to reach for it. A model has only this. */
  description: string
  params: P
  /**
   * Whether a successful call changes the scene. A caller that ran only
   * read-only ops rolls its undo transaction back rather than committing an
   * empty one, which would clear the user's redo stack.
   */
  mutates: boolean
  expose: OpExposure
  verbs?: readonly OpVerb[]
  /**
   * Lines a console prints for a successful result. Without it the data is
   * printed as JSON.
   */
  format?(data: unknown): string[]
  run(ctx: WorkerContext, args: ArgsOf<P>, oc: OpContext): OpOutcome | Promise<OpOutcome>
}

/**
 * An op of any parameter shape, for catalogues and adapters.
 *
 * `any` because `run` is contravariant in its arguments: an `Op<{ x }>` is
 * not assignable to an `Op<ParamMap>`, yet the adapters only ever pass it the
 * arguments its own params describe.
 */
export type AnyOp = Op<any>

/** Declare an op; the identity, there for inference of `run`'s arguments. */
export function defineOp<P extends ParamMap>(op: Op<P>): Op<P> {
  return op
}
