/**
 * @file worker/server/catalog/ops/editOps.test.ts
 * @description `reset_prop node.*` is the inspector's Reset all: one call,
 * only the properties that were changed and can be reset.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/worker/server/services/props/read', () => ({
  getGenericProps: () => ({
    ok: true,
    entries: [
      { key: 'width', isContainer: false, readonly: false, hasdefault: true, isdefault: false },
      { key: 'color', isContainer: false, readonly: false, hasdefault: true, isdefault: true },
      { key: 'uid', isContainer: false, readonly: true, hasdefault: false, isdefault: false },
      { key: 'coloring', isContainer: true, readonly: false, hasdefault: false, isdefault: false },
    ],
  }),
}))
const { resetGenericProps } = vi.hoisted(() => ({ resetGenericProps: vi.fn(() => ({ ok: true, entries: [] })) }))
vi.mock('@renderer/worker/server/services/props/write', () => ({ resetGenericProps }))
vi.mock('../refs', () => ({
  resolvePropPath: (_c: unknown, _s: number, text: string) =>
    ({ ok: true, nodeId: 39, nodeType: 'renderer', prop: text.slice(text.lastIndexOf('.') + 1) }),
}))

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { OpContext } from '../op'
import { resetProp } from './editOps'

const oc = { sceneId: 1, viewId: 2 } as OpContext

describe('reset_prop', () => {
  it('resets only the changed, resettable properties for node.*, in one call', async () => {
    await resetProp.run({} as WorkerContext, { path: '1crn/simple1.*' }, oc)
    expect(resetGenericProps).toHaveBeenCalledTimes(1)
    expect(resetGenericProps).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ nodeId: 39, propNames: ['width'] }))
  })
})
