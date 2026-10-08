/**
 * @file plugins/console/renderer/sceneRequest.test.ts
 * @description How a scene command names a scene, and that closing never
 * throws unsaved changes away unasked.
 */

import { describe, it, expect, vi } from 'vitest'
import type { OpenScene, SceneTabs } from '@renderer/plugin-host/api'
import { doSceneRequest, findScene } from './sceneRequest'

function scene(sceneId: number, name: string, extra: Partial<OpenScene> = {}): OpenScene {
  return { sceneId, name, viewIds: [sceneId * 10], active: false, modified: false, ...extra }
}

describe('scene commands', () => {
  it('name a scene by list number, #uid or name, and the active one by nothing', () => {
    const list = [scene(5, 'a', { active: true }), scene(9, 'b'), scene(12, 'b')]
    expect(findScene(list, '2')).toBe(list[1])
    expect(findScene(list, '#12')).toBe(list[2])
    expect(findScene(list, 'a')).toBe(list[0])
    expect(findScene(list, '')).toBe(list[0])
    // A shared name is refused rather than guessed.
    expect(findScene(list, 'b')).toMatch(/2 scenes are named "b"/)
  })

  it('close a modified scene only with force', async () => {
    const tabs = {
      list: vi.fn(async () => [scene(5, 'a', { active: true, modified: true })]),
      close: vi.fn(async () => true),
    } as unknown as SceneTabs
    const refused = await doSceneRequest(tabs, { op: 'close', scene: '', force: false })
    expect(refused.ok).toBe(false)
    expect(tabs.close).not.toHaveBeenCalled()

    const forced = await doSceneRequest(tabs, { op: 'close', scene: '', force: true })
    expect(forced.ok).toBe(true)
    expect(tabs.close).toHaveBeenCalledWith(5)
  })
})
