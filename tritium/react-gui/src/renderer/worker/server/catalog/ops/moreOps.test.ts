/**
 * @file worker/server/catalog/ops/moreOps.test.ts
 * @description save_scene's writer options: compression or base64 needs the
 * QDF1 format, so asking for one without a version picks QDF1 (the writer's
 * own default, QDF0, would drop it silently), and asking for one with QDF0
 * is refused.
 */

import { describe, it, expect, vi } from 'vitest'

const { saveScene } = vi.hoisted(() => ({ saveScene: vi.fn((..._a: unknown[]) => ({ ok: true })) }))

vi.mock('@renderer/worker/server/services/scene/saveScene', () => ({ saveScene }))
vi.mock('../outputFile', () => ({ outputPath: (_oc: unknown, p: string) => ({ path: p }) }))

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { OpContext } from '../op'
import { saveSceneOp } from './moreOps'

const oc = { sceneId: 1, viewId: 2, callId: 'c', markMutated: vi.fn() } as unknown as OpContext
const none = { embedAll: null, version: null, compress: null, base64: null }

describe('save_scene', () => {
  it('writes QDF1 when compression is asked without a version, and refuses it with QDF0', async () => {
    const ctx = {} as WorkerContext

    const res = await saveSceneOp.run(ctx, { ...none, path: '/tmp/a.qsc', compress: 'gzip' }, oc)
    expect(res.ok).toBe(true)
    expect(saveScene.mock.calls[0][1]).toMatchObject({ options: { version: 'QDF1', compress: 'gzip' } })

    const refused = await saveSceneOp.run(ctx, { ...none, path: '/tmp/a.qsc', version: 'QDF0', compress: 'gzip' }, oc)
    expect(refused.ok).toBe(false)
    expect(saveScene).toHaveBeenCalledTimes(1)
  })
})
