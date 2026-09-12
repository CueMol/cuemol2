/**
 * @file plugins/agent/worker/tools/types.ts
 * @description What an agent tool is.
 *
 * A tool is the adapter between one function the model may call and one (or
 * a few) existing worker services. It owns the JSON schema the model sees,
 * the translation into service arguments, and the decision of whether calling
 * it counts as changing the scene.
 *
 * Schemas are written by hand. There is no TS-type-to-JSON-schema generator
 * in this workspace, and `strict: true` makes the API enforce the shape
 * before the call arrives, so a client-side validator would only repeat work
 * the API has already done.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

/**
 * A JSON Schema object in the shape `strict: true` requires: every property
 * listed in `required`, and no additional ones. An optional argument is
 * expressed as a nullable type (`['string', 'null']`), not by omission.
 */
export interface StrictObjectSchema {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
  additionalProperties: false
}

/** What a tool reports back. `data` is serialised for the model. */
export type ToolOutcome =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

/** The turn a tool call belongs to. */
export interface TurnContext {
  turnId: string
  sceneId: number
  viewId: number
  /** Set by the loop when a mutating tool succeeds; decides commit vs rollback. */
  mutated: boolean
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

/** Build a strict schema from its properties; every key becomes required. */
export function strictSchema(properties: Record<string, unknown>): StrictObjectSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

/** A required string argument. */
export function str(description: string): Record<string, unknown> {
  return { type: 'string', description }
}

/** A required integer argument (a uid, a count). */
export function int(description: string): Record<string, unknown> {
  return { type: 'integer', description }
}

/** A required boolean argument. */
export function bool(description: string): Record<string, unknown> {
  return { type: 'boolean', description }
}

/** An argument the model may decline to supply, spelled as nullable. */
export function nullable(
  type: 'string' | 'integer' | 'number' | 'boolean',
  description: string,
): Record<string, unknown> {
  return { type: [type, 'null'], description }
}

/** A required enumerated string. */
export function enumStr(values: string[], description: string): Record<string, unknown> {
  return { type: 'string', enum: values, description }
}
