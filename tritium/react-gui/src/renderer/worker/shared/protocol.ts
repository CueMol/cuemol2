/**
 * @file worker/shared/protocol.ts
 * @description The wire protocol between the renderer and the worker: the
 * shape of a request and a reply, and the sequence number that means "do not
 * reply at all".
 *
 * Loaded by both threads, so it holds constants and types only.
 */

/**
 * Sequence number marking a call the caller will never wait on.
 *
 * Most calls are request/reply: the renderer allocates a sequence number,
 * the worker echoes it back, and the transport matches the two. But the
 * input forwarders are fire-and-forget by construction -- a mouse move has
 * no result, and nothing awaits one -- so every pointer event was costing a
 * reply the transport had already forgotten how to route. At 60 Hz across a
 * drag that is a second message per frame, posted, structured-cloned and
 * discarded.
 *
 * `getSeqNo` counts from 1 (it increments before returning), so 0 can never
 * collide with a real call.
 */
export const NO_REPLY_SEQ = 0;

/** `[method, seqno, ...args]` -- what the renderer posts to the worker. */
export type WireRequest = [string, number, ...unknown[]];

/** `[method, seqno, ok, ...result]` -- what the worker posts back. */
export type WireReply = [string, number, boolean, ...unknown[]];
