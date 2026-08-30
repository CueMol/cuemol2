import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/rend/rend.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

interface RendStub {
  type_name: string
  name: string
}

/**
 * Build a ctx whose scene resolves a target renderer to a parent object that
 * enumerates `siblings`. Mirrors UXP `getClientObj()` + `getRendNameList`.
 */
function makeCtx(siblings: RendStub[], opts?: { noParent?: boolean }) {
  const parent = {
    getRendCount: () => siblings.length,
    getRendererByIndex: (i: number) => siblings[i] ?? null,
  }
  const targetRend = {
    getClientObj: () => (opts?.noParent ? null : parent),
  }
  return {
    sceMgr: {
      getScene: vi.fn((id: number) =>
        id === 7
          ? { getRenderer: (nid: number) => (nid === 3 ? targetRend : null) }
          : null,
      ),
    },
  } as unknown as WorkerContext
}

describe('getSiblingRendererNames service', () => {
  it('returns only sibling renderers whose type_name is in typeNames', () => {
    const ctx = makeCtx([
      { type_name: 'tube', name: 'tube1' },
      { type_name: 'simple', name: 'simple1' },
      { type_name: 'cartoon', name: 'cartoon1' },
      { type_name: 'disorder', name: 'diso1' },
      { type_name: 'nucl', name: 'nucl1' },
    ])
    const result = services.getSiblingRendererNames(ctx, {
      sceneId: 7,
      nodeId: 3,
      typeNames: ['tube', 'ribbon', 'cartoon', 'nucl'],
    })
    expect(result.names).toEqual(['tube1', 'cartoon1', 'nucl1'])
  })

  it('returns an empty list when the scene is missing', () => {
    const ctx = makeCtx([{ type_name: 'tube', name: 'tube1' }])
    expect(
      services.getSiblingRendererNames(ctx, {
        sceneId: 99,
        nodeId: 3,
        typeNames: ['tube'],
      }).names,
    ).toEqual([])
  })

  it('returns an empty list when the renderer has no parent object', () => {
    const ctx = makeCtx([{ type_name: 'tube', name: 'tube1' }], { noParent: true })
    expect(
      services.getSiblingRendererNames(ctx, {
        sceneId: 7,
        nodeId: 3,
        typeNames: ['tube'],
      }).names,
    ).toEqual([])
  })

  it('returns an empty list when no sibling type matches', () => {
    const ctx = makeCtx([{ type_name: 'simple', name: 'simple1' }])
    expect(
      services.getSiblingRendererNames(ctx, {
        sceneId: 7,
        nodeId: 3,
        typeNames: ['tube', 'ribbon', 'cartoon', 'nucl'],
      }).names,
    ).toEqual([])
  })
})
