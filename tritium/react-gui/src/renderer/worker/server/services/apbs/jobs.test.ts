/**
 * @file worker/server/services/apbs/jobs.test.ts
 * @description Waiting for an APBS job from inside the worker (the console's
 * `apbs`): it ends with the outcome the dialog is pushed, and Stop cancels it.
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { emit, jobs, waitForApbsJob } from './jobs'
import type { ApbsJobEntry } from './types'

const ctx = { svc: { pushMessage: vi.fn() } } as unknown as WorkerContext

describe('waitForApbsJob', () => {
  it('resolves with the pushed end, and cancels once when stopped', async () => {
    jobs.set('apbs-a', {} as ApbsJobEntry)
    const done = waitForApbsJob('apbs-a', () => false, () => undefined)
    emit(ctx, { type: 'complete', jobId: 'apbs-a', newObjId: 7, newObjName: 'pot_1crn', elapsedSec: 1 })
    jobs.delete('apbs-a')
    expect(await done).toMatchObject({ type: 'complete', newObjId: 7 })
    // The dialog is still told.
    expect(ctx.svc.pushMessage).toHaveBeenCalled()

    jobs.set('apbs-b', {} as ApbsJobEntry)
    const cancel = vi.fn(() => { jobs.delete('apbs-b') })
    const stopped = await waitForApbsJob('apbs-b', () => true, cancel)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(stopped.type).toBe('error')
  })
})
