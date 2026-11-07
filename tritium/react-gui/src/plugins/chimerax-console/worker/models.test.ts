/**
 * @file plugins/chimerax-console/worker/models.test.ts
 * @description ChimeraX model numbers: the lowest free number, reused after a close.
 */

import { describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const scene = vi.hoisted(() => ({ objects: [] as { uid: number; name: string; className: string }[] }))

vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: () => ({ objects: scene.objects }),
}))

import { numberedObjects } from './models'

const ctx = {} as WorkerContext
const mol = (uid: number, name: string) => ({ uid, name, className: 'MolCoord' })
const numbers = () => numberedObjects(ctx, 1).map((o) => `${o.name}#${o.model}`)

describe('model numbers', () => {
  it('numbers objects in the order seen, keeps a number when another closes, and reuses the freed one', () => {
    scene.objects = [mol(10, 'a'), mol(11, 'b'), mol(12, 'c')]
    expect(numbers()).toEqual(['a#1', 'b#2', 'c#3'])
    // `b` closed (or undone): it is gone, and `a` and `c` keep their numbers.
    scene.objects = [mol(10, 'a'), mol(12, 'c')]
    expect(numbers()).toEqual(['a#1', 'c#3'])
    // A new object takes the lowest free number (ChimeraX's next_id), then the next one up.
    scene.objects = [mol(10, 'a'), mol(12, 'c'), mol(13, 'd'), mol(14, 'e')]
    expect(numbers()).toEqual(['a#1', 'd#2', 'c#3', 'e#4'])
  })
})
