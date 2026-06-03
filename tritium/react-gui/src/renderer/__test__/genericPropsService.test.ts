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
// Run the mutation body synchronously (no real UndoManager) while exposing a
// spy so tests can assert whether / when a write went through a transaction.
const withUndoTxnSpy = vi.hoisted(() =>
  vi.fn((_scene: unknown, _label: string, fn: () => unknown) => fn()),
)
vi.mock('../worker/server/services/withUndoTxn', () => ({
  withUndoTxn: withUndoTxnSpy,
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

  // --- Realtime drag write modes ---

  it('previews a write without an undo transaction and returns no entries', () => {
    const res = call({ propName: 'alpha', valueType: 'real', value: 0.7, mode: 'preview' })
    expect(res.ok).toBe(true)
    expect(res.entries).toEqual([])
    expect(setProp).toHaveBeenCalledWith('alpha', 0.7)
    expect(withUndoTxnSpy).not.toHaveBeenCalled()
  })

  it('realtime commit restores the original (txn-free) then commits the final inside a txn', () => {
    const res = call({
      propName: 'alpha',
      valueType: 'real',
      value: 0.7,
      mode: 'commit',
      originalValue: 0.2,
    })
    expect(res.ok).toBe(true)
    expect(setProp).toHaveBeenNthCalledWith(1, 'alpha', 0.2)
    expect(setProp).toHaveBeenNthCalledWith(2, 'alpha', 0.7)
    expect(withUndoTxnSpy).toHaveBeenCalledTimes(1)
    // The restore precedes opening the txn; the final write happens inside it.
    expect(setProp.mock.invocationCallOrder[0]).toBeLessThan(
      withUndoTxnSpy.mock.invocationCallOrder[0],
    )
    expect(setProp.mock.invocationCallOrder[1]).toBeGreaterThan(
      withUndoTxnSpy.mock.invocationCallOrder[0],
    )
  })

  it('default commit (no mode/originalValue) wraps a single write in one txn', () => {
    const res = call({ propName: 'alpha', valueType: 'real', value: 0.7 })
    expect(res.ok).toBe(true)
    expect(withUndoTxnSpy).toHaveBeenCalledTimes(1)
    expect(setProp).toHaveBeenCalledTimes(1)
    expect(setProp).toHaveBeenCalledWith('alpha', 0.7)
  })

  // --- Default-flag-aware restore (undo reverts the default state too) ---

  it('realtime commit of a default prop restores via resetProp before the txn', () => {
    const res = call({
      propName: 'alpha',
      valueType: 'real',
      value: 0.7,
      mode: 'commit',
      originalValue: 0.2,
      originalWasDefault: true,
    })
    expect(res.ok).toBe(true)
    // resetProp (flag + value) restores the pre-drag default state, txn-free,
    // so the in-txn setProp re-trips the default -> non-default transition.
    expect(resetProp).toHaveBeenCalledWith('alpha')
    expect(setProp).toHaveBeenCalledWith('alpha', 0.7)
    expect(withUndoTxnSpy).toHaveBeenCalledTimes(1)
    expect(resetProp.mock.invocationCallOrder[0]).toBeLessThan(
      withUndoTxnSpy.mock.invocationCallOrder[0],
    )
    expect(setProp.mock.invocationCallOrder[0]).toBeGreaterThan(
      withUndoTxnSpy.mock.invocationCallOrder[0],
    )
  })

  it('realtime commit of a non-default prop restores via setProp (no resetProp)', () => {
    const res = call({
      propName: 'alpha',
      valueType: 'real',
      value: 0.7,
      mode: 'commit',
      originalValue: 0.2,
      originalWasDefault: false,
    })
    expect(res.ok).toBe(true)
    expect(resetProp).not.toHaveBeenCalled()
    expect(setProp).toHaveBeenNthCalledWith(1, 'alpha', 0.2)
    expect(setProp).toHaveBeenNthCalledWith(2, 'alpha', 0.7)
  })

  it('aborts a default prop via resetProp, txn-free, with no entries', () => {
    const res = call({
      propName: 'alpha',
      valueType: 'real',
      value: 0.2,
      mode: 'abort',
      originalWasDefault: true,
    })
    expect(res.ok).toBe(true)
    expect(res.entries).toEqual([])
    expect(resetProp).toHaveBeenCalledWith('alpha')
    expect(setProp).not.toHaveBeenCalled()
    expect(withUndoTxnSpy).not.toHaveBeenCalled()
  })

  it('aborts a non-default prop via setProp(original), txn-free', () => {
    const res = call({
      propName: 'alpha',
      valueType: 'real',
      value: 0.2,
      mode: 'abort',
      originalWasDefault: false,
    })
    expect(res.ok).toBe(true)
    expect(setProp).toHaveBeenCalledWith('alpha', 0.2)
    expect(resetProp).not.toHaveBeenCalled()
    expect(withUndoTxnSpy).not.toHaveBeenCalled()
  })
})
