/**
 * @file plugins/chimerax-console/worker/cli/complete.test.ts
 * @description Tab after `#` in an atom specification offers the model numbers.
 *
 * Also pins that a command's own word is not read as its keyword: `color`
 * has a `color` keyword, and reading the command as it once left Tab
 * offering colour values only.
 */

import { describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const scene = vi.hoisted(() => ({ objects: [] as { uid: number; name: string; className: string }[] }))

vi.mock('@renderer/worker/server/services/scene/listSceneObjects', () => ({
  listSceneObjects: () => ({ objects: scene.objects }),
}))

import { CHIMERAX_DIALECT } from '../index'

const complete = (line: string) =>
  CHIMERAX_DIALECT.syntax.complete({} as WorkerContext, line, { sceneId: 1, viewId: 1, cwd: '/', dialect: CHIMERAX_DIALECT })

describe('model numbers', () => {
  it('writes the only model in, and lists them by number and name when there are several', () => {
    scene.objects = [{ uid: 10, name: '1crn', className: 'MolCoord' }]
    expect(complete('color #').replacement).toBe('color #1')
    scene.objects = [...scene.objects, { uid: 11, name: '4hhb', className: 'MolCoord' }]
    const out = complete('color #')
    expect(out.candidates?.map((c) => c.label)).toEqual(['#1 1crn', '#2 4hhb'])
  })
})
