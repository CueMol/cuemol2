/**
 * @file shared/renderJobStatus.ts
 * @description Lifecycle status of a render job and the "still running" test.
 *
 * Shared because two sides need to agree on it: the renderer drives the job
 * and shows its state, and the main process holds a power-save blocker for as
 * long as the job it is told about is still progressing (main/renderActivity).
 * The wire type (RenderJobWire.status) is a plain string, so main classifies
 * it with isActiveRenderJobStatus rather than with the renderer's union.
 */

/** Lifecycle status of a render job. */
export type RenderJobStatus =
  | 'exporting'
  | 'running'
  | 'blending'
  | 'done'
  | 'error'
  | 'cancelled'

const ACTIVE_STATUSES: ReadonlySet<string> = new Set<RenderJobStatus>([
  'exporting',
  'running',
  'blending',
])

/** True while a job with this status is still progressing. */
export function isActiveRenderJobStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status)
}
