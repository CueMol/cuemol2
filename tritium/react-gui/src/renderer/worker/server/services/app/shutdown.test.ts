/**
 * @file worker/server/services/app/shutdown.test.ts
 * @description Pins that quitting stops the external processes it started.
 *
 * Renders (POV-Ray, plus the ffmpeg encode of a movie) and APBS runs are not
 * worker work: they are external processes started through the C++
 * ProcessManager and watched by a poll timer. posix_spawn children are
 * ordinary children, so they survive the app. Nothing was cancelling them on
 * the way out, which left them running -- burning CPU, and writing into a work
 * directory nothing would reclaim, since a job's directory is only registered
 * for cleanup once it completes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const renderCancelled: string[] = []
const apbsCancelled: string[] = []

vi.mock('../renderjob/renderJob.service', () => ({
  cancelAllRenderJobs: vi.fn(() => {
    const n = renderCancelled.length
    return n
  }),
}))
vi.mock('../apbs/apbs.service', () => ({
  cancelAllApbsJobs: vi.fn(() => apbsCancelled.length),
}))

import { services } from './app.service'
import { cancelAllRenderJobs } from '../renderjob/renderJob.service'
import { cancelAllApbsJobs } from '../apbs/apbs.service'

const ctx = {} as WorkerContext

beforeEach(() => {
  renderCancelled.length = 0
  apbsCancelled.length = 0
  vi.clearAllMocks()
})

describe('cancelAllJobs', () => {
  it('cancels both job kinds and reports the counts', () => {
    renderCancelled.push('render-1', 'render-2')
    apbsCancelled.push('apbs-1')

    const res = services.cancelAllJobs(ctx)

    expect(cancelAllRenderJobs).toHaveBeenCalledWith(ctx)
    expect(cancelAllApbsJobs).toHaveBeenCalledWith(ctx)
    expect(res).toEqual({ ok: true, render: 2, apbs: 1 })
  })

  it('is a no-op when nothing is running', () => {
    const res = services.cancelAllJobs(ctx)
    expect(res).toEqual({ ok: true, render: 0, apbs: 0 })
  })

  it('cancels APBS even when there is no render job, and vice versa', () => {
    apbsCancelled.push('apbs-1')
    expect(services.cancelAllJobs(ctx)).toEqual({ ok: true, render: 0, apbs: 1 })

    apbsCancelled.length = 0
    renderCancelled.push('render-1')
    expect(services.cancelAllJobs(ctx)).toEqual({ ok: true, render: 1, apbs: 0 })
  })
})
