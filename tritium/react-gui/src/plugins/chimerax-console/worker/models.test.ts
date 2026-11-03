/**
 * @file plugins/chimerax-console/worker/models.test.ts
 * @description ChimeraX model numbers: given in opening order, never reused.
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
  it('numbers objects in the order seen, keeps a number when another closes, and never reuses one', () => {
    scene.objects = [mol(10, 'a'), mol(11, 'b')]
    expect(numbers()).toEqual(['a#1', 'b#2'])
    // `a` closed (or undone): it is gone, and `b` keeps #2.
    scene.objects = [mol(11, 'b')]
    expect(numbers()).toEqual(['b#2'])
    // A new object, or `a` brought back by undo as a new uid, takes the next number.
    scene.objects = [mol(11, 'b'), mol(12, 'c')]
    expect(numbers()).toEqual(['b#2', 'c#3'])
  })
})
