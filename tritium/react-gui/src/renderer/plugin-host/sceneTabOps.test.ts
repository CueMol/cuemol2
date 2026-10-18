/**
 * @file renderer/plugin-host/sceneTabOps.test.ts
 * @description How a scene command names a scene, and that closing never
 * throws unsaved changes away unasked -- for the console and MCP alike.
 */

import { describe, it, expect, vi } from 'vitest'
import type { OpenScene, SceneTabs } from './sceneTabs'
import { closeScene, resolveScene } from './sceneTabOps'

function scene(sceneId: number, name: string, extra: Partial<OpenScene> = {}): OpenScene {
  return { sceneId, name, viewIds: [sceneId * 10], active: false, modified: false, ...extra }
}

describe('scene tab operations', () => {
  it('name a scene by list number, #uid, name or sceneId, and the active one by nothing', () => {
    const list = [scene(5, 'a', { active: true }), scene(9, 'b'), scene(12, 'b')]
    expect(resolveScene(list, '2')).toMatchObject({ sceneId: 9, number: 2 })
    expect(resolveScene(list, '#12')).toMatchObject({ sceneId: 12, number: 3 })
    expect(resolveScene(list, 'a')).toMatchObject({ sceneId: 5 })
    expect(resolveScene(list, 9)).toMatchObject({ sceneId: 9 })
    expect(resolveScene(list, null)).toMatchObject({ sceneId: 5 })
    // A shared name is refused rather than guessed.
    expect(resolveScene(list, 'b')).toMatch(/2 scenes are named "b"/)
  })

  it('close a modified scene only when told to discard its changes', async () => {
    const tabs = {
      list: vi.fn(async () => [scene(5, 'a', { active: true, modified: true })]),
      close: vi.fn(async () => true),
    } as unknown as SceneTabs
    expect((await closeScene(tabs, null, false)).ok).toBe(false)
    expect(tabs.close).not.toHaveBeenCalled()

    expect((await closeScene(tabs, null, true)).ok).toBe(true)
    expect(tabs.close).toHaveBeenCalledWith(5)
  })
})
