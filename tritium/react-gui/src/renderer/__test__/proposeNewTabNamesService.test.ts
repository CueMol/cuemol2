import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/proposeNewTabNames.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

function makeCtx(options: {
  sceneNames?: string[]
  viewNamesBySceneId?: Record<number, string[]>
  scenesById?: Record<number, { name: string }>
} = {}) {
  const { sceneNames = [], viewNamesBySceneId = {}, scenesById = {} } = options

  const ctx = {
    sceMgr: {
      getSceneByName: vi.fn((name: string) => {
        return sceneNames.includes(name) ? { uid: 99 } : null
      }),
      getScene: vi.fn((uid: number) => {
        const meta = scenesById[uid]
        if (!meta) return null
        const viewNames = viewNamesBySceneId[uid] ?? []
        return {
          name: meta.name,
          getUID: () => uid,
          getViewByName: vi.fn((vname: string) => (viewNames.includes(vname) ? { uid: 999 } : null)),
        }
      }),
    },
  } as unknown as WorkerContext

  return { ctx }
}

describe('proposeNewTabNames service', () => {
  it('returns "Untitled 1" / "1" when no scenes exist (no sceneId)', () => {
    const { ctx } = makeCtx()
    expect(services.proposeNewTabNames(ctx, {})).toEqual({
      currentSceneName: null,
      defaultSceneName: 'Untitled 1',
      defaultViewName: '1',
    })
  })

  it('skips taken scene names ("Untitled 1", "Untitled 2") and proposes "Untitled 3"', () => {
    const { ctx } = makeCtx({ sceneNames: ['Untitled 1', 'Untitled 2'] })
    const result = services.proposeNewTabNames(ctx, {})
    expect(result.defaultSceneName).toBe('Untitled 3')
  })

  it('returns null currentSceneName when scene exists but has no name (no Scene_uid fallback)', () => {
    const { ctx } = makeCtx({
      scenesById: { 1: { name: '' } },
      viewNamesBySceneId: { 1: [] },
    })
    const result = services.proposeNewTabNames(ctx, { sceneId: 1 })
    expect(result.currentSceneName).toBeNull()
    expect(result.defaultViewName).toBe('1')
  })

  it('returns the scene rawName as currentSceneName when set', () => {
    const { ctx } = makeCtx({
      scenesById: { 1: { name: 'Untitled 1' } },
      viewNamesBySceneId: { 1: ['0'] },
    })
    const result = services.proposeNewTabNames(ctx, { sceneId: 1 })
    expect(result.currentSceneName).toBe('Untitled 1')
    // "0" already taken (initial view), next number is 1
    expect(result.defaultViewName).toBe('1')
  })

  it('proposes the next free numeric view name within the scene', () => {
    const { ctx } = makeCtx({
      scenesById: { 1: { name: 'Untitled 1' } },
      viewNamesBySceneId: { 1: ['0', '1', '2'] },
    })
    const result = services.proposeNewTabNames(ctx, { sceneId: 1 })
    expect(result.defaultViewName).toBe('3')
  })

  it('falls back to "1" view name when sceneId not found', () => {
    const { ctx } = makeCtx({ scenesById: {} })
    const result = services.proposeNewTabNames(ctx, { sceneId: 999 })
    expect(result).toEqual({
      currentSceneName: null,
      defaultSceneName: 'Untitled 1',
      defaultViewName: '1',
    })
  })
})
