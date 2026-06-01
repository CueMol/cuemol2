/**
 * setGenericProp write-path contract.
 *
 * Pins the UXP `commitPropChange` parity added for the renderer-common page:
 * an `object<MolSelection>` write compiles the string via `makeSel` and sets
 * the resulting SelCommand, while every other (scalar) write sets the raw
 * value directly. Wrapper setters are spied via a plain object literal (see
 * tritium/CLAUDE.md "wrapper setter spying").
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

vi.mock('../worker/server/services/helpers/resolvePropTarget', () => ({
  resolvePropTarget: vi.fn(),
}))
vi.mock('../worker/server/services/withUndoTxn', () => ({
  // Run the mutation body synchronously, no real UndoManager.
  withUndoTxn: (_scene: unknown, _label: string, fn: () => unknown) => fn(),
}))
vi.mock('../worker/server/services/helpers/makeSel', () => ({
  makeSel: vi.fn(),
}))
vi.mock('../worker/server/services/helpers/parseGenericProps', () => ({
  parseGenericProps: () => [],
}))

import { services } from '../worker/server/services/genericProps.service'
import { resolvePropTarget } from '../worker/server/services/helpers/resolvePropTarget'
import { makeSel } from '../worker/server/services/helpers/makeSel'

const setProp = vi.fn()
const resetProp = vi.fn()
const target = { setProp, resetProp, getPropsJSON: () => '[]' }
const scene = { uid: 42 }
const ctx = {} as never

function call(over: Record<string, unknown>) {
  return services.setGenericProp(ctx, {
    sceneId: 1,
    nodeId: 2,
    nodeType: 'renderer',
    propName: 'x',
    op: 'set',
    valueType: 'string',
    ...over,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(resolvePropTarget as Mock).mockReturnValue({ scene, target })
})

describe('setGenericProp', () => {
  it('sets a scalar value directly without compiling a selection', () => {
    const res = call({ propName: 'alpha', valueType: 'real', value: 0.5 })
    expect(res.ok).toBe(true)
    expect(setProp).toHaveBeenCalledWith('alpha', 0.5)
    expect(makeSel).not.toHaveBeenCalled()
  })

  it('compiles an object<MolSelection> value and sets the SelCommand', () => {
    ;(makeSel as Mock).mockReturnValue({ wrapped: 'NATIVE_SEL' })
    const res = call({ propName: 'sel', valueType: 'object<MolSelection>', value: 'protein' })
    expect(res.ok).toBe(true)
    expect(makeSel).toHaveBeenCalledWith(ctx, 'protein', 42)
    expect(setProp).toHaveBeenCalledWith('sel', 'NATIVE_SEL')
  })

  it('fails (no write) when a selection string does not compile', () => {
    ;(makeSel as Mock).mockReturnValue(null)
    const res = call({ propName: 'sel', valueType: 'object<MolSelection>', value: 'bogus(' })
    expect(res.ok).toBe(false)
    expect(setProp).not.toHaveBeenCalled()
  })

  it('resets a property to its default', () => {
    const res = call({ propName: 'alpha', op: 'reset', valueType: '' })
    expect(res.ok).toBe(true)
    expect(resetProp).toHaveBeenCalledWith('alpha')
    expect(setProp).not.toHaveBeenCalled()
  })
})
