/**
 * @file plugins/agent/worker/tools/types.ts
 * @description What an agent tool is.
 *
 * A tool is an op from the core catalogue (`worker/server/catalog`) as the
 * model sees it: the op's name and description, its parameters as a strict
 * JSON Schema, and a `run` that reads the model's arguments into the op's
 * types and invokes it within the turn. The tools are generated from the
 * catalogue (`index.ts`); this type stays separate so a test can hand the
 * loop a tool of its own without declaring an op.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { OpImage, OpOutcome, StrictObjectSchema } from '@renderer/worker/server/catalog'
import { paramsSchema } from '@renderer/worker/server/catalog'

export type { StrictObjectSchema } from '@renderer/worker/server/catalog'

/** A picture a tool hands the model to look at, alongside its JSON result. */
export type ToolImage = OpImage

/**
 * What a tool reports back. `data` is serialised for the model; `image`, when
 * present, is sent next to it as an image part rather than inside the JSON.
 */
export type ToolOutcome = OpOutcome

/** The turn a tool call belongs to. */
export interface TurnContext {
  turnId: string
  sceneId: number
  viewId: number
  /** Set by the loop when a mutating tool succeeds; decides commit vs rollback. */
  mutated: boolean
  /**
   * The toolsets switched on in this conversation (`enable_toolsets`). Their
   * tools are offered from the next step on.
   */
  toolsets: Set<string>
  /** Identifies this call, e.g. for a cancellable download. */
  callId: string
  /**
   * Register a stream request id so cancelling the turn aborts it too.
   *
   * A download runs inside `streamFetchToReader`, which holds its own
   * AbortController keyed by request id; aborting the model request alone
   * would leave the download running.
   */
  noteStream: (reqId: string) => void
  /**
   * What each call answered, by tool-call id.
   *
   * The transcript line for a result is pushed when the SDK reports the call
   * finished, not when the tool returns -- pushing from the tool can beat the
   * line announcing the call, and a result with nothing to attach to is
   * dropped. The outcome is parked here in the meantime.
   */
  outcomes: Map<string, ToolOutcome>
  /**
   * Tool runs that have not settled yet.
   *
   * An aborted stream closes without waiting for them, so the loop waits
   * here instead: a tool still writing to the scene after the undo
   * transaction closed would leave an edit outside it.
   */
  inflight: Set<Promise<unknown>>
  /**
   * Serialises tool runs within the turn.
   *
   * The SDK runs a step's tool calls concurrently. They share one worker
   * thread, so they cannot interleave except at an await -- but a download
   * awaits, and the scene edits that follow it would then land in a
   * different order than the model asked for.
   */
  queue: Promise<void>
}

export interface AgentTool {
  /** snake_case, as the model sees it. Unique across the catalogue. */
  name: string
  /** What it does AND when to reach for it. The model has only this. */
  description: string
  parameters: StrictObjectSchema
  /**
   * Whether a successful call changes the scene. A turn whose tools were all
   * read-only rolls its transaction back rather than committing an empty one,
   * which would clear the user's redo stack.
   */
  mutates: boolean
  run(
    ctx: WorkerContext,
    input: Record<string, unknown>,
    turn: TurnContext,
  ): ToolOutcome | Promise<ToolOutcome>
}

/** A strict schema with no parameters, for tests that declare their own tool. */
export function emptySchema(): StrictObjectSchema {
  return paramsSchema({})
}
