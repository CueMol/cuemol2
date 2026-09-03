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

vi.mock('@renderer/worker/server/services/props/target', () => ({
  resolvePropTarget: vi.fn(),
}))
// Run the mutation body synchronously (no real UndoManager) while exposing a
// spy so tests can assert whether / when a write went through a transaction.
const withUndoTxnSpy = vi.hoisted(() =>
  vi.fn((_scene: unknown, _label: string, fn: () => unknown) => fn()),
)
vi.mock('@renderer/worker/server/services/withUndoTxn', () => ({
  withUndoTxn: withUndoTxnSpy,
}))
vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
  makeSel: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/helpers/parseGenericProps', () => ({
  parseGenericProps: () => [],
}))

import { services } from '@renderer/worker/server/services/props/props.service'
import { resolvePropTarget } from '@renderer/worker/server/services/props/target'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'

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

  it('routes a scene name write through Scene.setName(), not setProp', () => {
    // Scene.name is a readonly C++ property; renaming goes via setName() so the
    // propChanged("name") event fires (tree + tab strip stay in sync).
    const setName = vi.fn()
    const sceneTarget = { setName, setProp, resetProp, getPropsJSON: () => '[]', uid: 42 }
    ;(resolvePropTarget as Mock).mockReturnValue({ scene: sceneTarget, target: sceneTarget })
    const res = call({ nodeType: 'scene', propName: 'name', valueType: 'string', value: 'NewScene' })
    expect(res.ok).toBe(true)
    expect(setName).toHaveBeenCalledWith('NewScene')
    expect(setProp).not.toHaveBeenCalled()
    expect(withUndoTxnSpy).toHaveBeenCalledTimes(1)
  })

  it('still writes a renderer name via setProp (scene-name routing is scene-only)', () => {
    const res = call({ nodeType: 'renderer', propName: 'name', valueType: 'string', value: 'rib2' })
    expect(res.ok).toBe(true)
    expect(setProp).toHaveBeenCalledWith('name', 'rib2')
  })

  // --- rendGroup name writes (membership is a name reference) ---

  it('renames a rendGroup and re-assigns each member group string in one txn', () => {
    const setChildGroup = vi.fn()
    const setOtherGroup = vi.fn()
    const clientObj = { rend_uids: '50,100,101' }
    const grp = {
      uid: 50, name: 'oldGrp', setProp, resetProp,
      getPropsJSON: () => '[]',
      getClientObj: () => clientObj,
    }
    const child = {
      uid: 100,
      get group() { return 'oldGrp' },
      set group(v: string) { setChildGroup(v) },
    }
    const other = {
      uid: 101,
      get group() { return '' },
      set group(v: string) { setOtherGroup(v) },
    }
    const sceneWithRends = {
      uid: 42,
      getRendByName: vi.fn(() => null),
      getRenderer: vi.fn((id: number) =>
        id === 50 ? grp : id === 100 ? child : id === 101 ? other : null),
    }
    ;(resolvePropTarget as Mock).mockReturnValue({ scene: sceneWithRends, target: grp })
    const res = call({
      nodeType: 'rendGroup', propName: 'name', valueType: 'string', value: ' newGrp ',
    })
    expect(res.ok).toBe(true)
    // Trimmed name written; member matched by OLD name follows; unrelated
    // sibling untouched. One txn covers the whole rename.
    expect(setProp).toHaveBeenCalledWith('name', 'newGrp')
    expect(setChildGroup).toHaveBeenCalledWith('newGrp')
    expect(setOtherGroup).not.toHaveBeenCalled()
    expect(withUndoTxnSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects a rendGroup rename that collides with another renderer scene-wide', () => {
    const grp = {
      uid: 50, name: 'oldGrp', setProp, resetProp,
      getPropsJSON: () => '[]',
      getClientObj: () => null,
    }
    const sceneWithDup = { uid: 42, getRendByName: vi.fn(() => ({ uid: 60 })) }
    ;(resolvePropTarget as Mock).mockReturnValue({ scene: sceneWithDup, target: grp })
    const res = call({
      nodeType: 'rendGroup', propName: 'name', valueType: 'string', value: 'taken',
    })
    expect(res.ok).toBe(false)
    expect(setProp).not.toHaveBeenCalled()
    expect(withUndoTxnSpy).not.toHaveBeenCalled()
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

/**
 * `getGenericProps` also reports which molecule the node's selection
 * properties are about, so the picker can count the atoms an expression
 * matches. A molecular renderer answers with its client object; a surface or
 * map renderer is attached to something else and names its reference molecule
 * in a property instead.
 */
describe('getGenericProps - selection-context molecule', () => {
  const mol = { getClassName: () => 'MolCoord', uid: 7 }

  /** A scene holding `mol` under `molName`, plus whatever else is named. */
  function sceneWith(byName: Record<string, unknown>) {
    return { uid: 42, getObjectByName: (n: string) => byName[n] ?? null }
  }

  function read(nodeType: 'renderer' | 'object' | 'scene' = 'renderer') {
    return services.getGenericProps(ctx, { sceneId: 1, nodeId: 2, nodeType } as never)
  }

  it('answers with the client object of a molecular renderer', () => {
    ;(resolvePropTarget as Mock).mockReturnValue({
      scene: sceneWith({}),
      target: { getPropsJSON: () => '[]', getClientObj: () => mol },
    })
    expect(read().molId).toBe(7)
  })

  it('falls back to the molecule a surface renderer names in `target`', () => {
    ;(resolvePropTarget as Mock).mockReturnValue({
      scene: sceneWith({ mol1: mol }),
      target: {
        getPropsJSON: () => '[]',
        getClientObj: () => ({ getClassName: () => 'MolSurfObj', uid: 9 }),
        target: 'mol1',
      },
    })
    expect(read().molId).toBe(7)
  })

  it('falls back to the boundary molecule of a map renderer', () => {
    ;(resolvePropTarget as Mock).mockReturnValue({
      scene: sceneWith({ mol1: mol }),
      target: {
        getPropsJSON: () => '[]',
        getClientObj: () => ({ getClassName: () => 'DensityMap', uid: 9 }),
        bndry_molname: 'mol1',
      },
    })
    expect(read().molId).toBe(7)
  })

  it('reports no molecule when the named one is gone, rather than a wrong uid', () => {
    ;(resolvePropTarget as Mock).mockReturnValue({
      scene: sceneWith({}),
      target: {
        getPropsJSON: () => '[]',
        getClientObj: () => ({ getClassName: () => 'MolSurfObj', uid: 9 }),
        target: 'deleted',
      },
    })
    expect(read().molId).toBeUndefined()
  })

  it('an Object node answers for itself, and only when it is a molecule', () => {
    ;(resolvePropTarget as Mock).mockReturnValue({ scene: sceneWith({}), target: { ...mol, getPropsJSON: () => '[]' } })
    expect(read('object').molId).toBe(7)
    ;(resolvePropTarget as Mock).mockReturnValue({
      scene: sceneWith({}),
      target: { getClassName: () => 'DensityMap', uid: 9, getPropsJSON: () => '[]' },
    })
    expect(read('object').molId).toBeUndefined()
  })

  it('has no molecule for a Scene node', () => {
    ;(resolvePropTarget as Mock).mockReturnValue({
      scene: sceneWith({}),
      target: { getPropsJSON: () => '[]', name: 'scene1' },
    })
    expect(read('scene').molId).toBeUndefined()
  })
})

describe('non-resettable name / sel', () => {
  it('refuses to reset a rendGroup name: no resetProp, no transaction', () => {
    const res = call({ nodeType: 'rendGroup', propName: 'name', op: 'reset', valueType: '' })
    expect(res.ok).toBe(false)
    expect(resetProp).not.toHaveBeenCalled()
    expect(withUndoTxnSpy).not.toHaveBeenCalled()
  })

  it('refuses to reset an object selection', () => {
    const res = call({ nodeType: 'object', propName: 'sel', op: 'reset', valueType: '' })
    expect(res.ok).toBe(false)
    expect(resetProp).not.toHaveBeenCalled()
  })

  it('refuses an abort that would reset the name to its "default"', () => {
    const res = call({
      propName: 'name', op: 'set', value: 'r1', mode: 'abort', originalWasDefault: true,
    })
    expect(res.ok).toBe(false)
    expect(resetProp).not.toHaveBeenCalled()
    expect(setProp).not.toHaveBeenCalled()
  })

  it('resetGenericProps skips name / sel and resets the rest in one transaction', () => {
    ;(resolvePropTarget as Mock).mockReturnValue({
      scene,
      target: { ...target, hasProp: () => true },
    })
    const res = services.resetGenericProps(ctx, {
      sceneId: 1, nodeId: 2, nodeType: 'renderer', propNames: ['name', 'alpha', 'sel', 'width'],
    })
    expect(res.ok).toBe(true)
    expect(withUndoTxnSpy).toHaveBeenCalledTimes(1)
    expect(withUndoTxnSpy.mock.calls[0][1]).toBe('Reset 2 properties')
    expect(resetProp.mock.calls.map((c) => c[0])).toEqual(['alpha', 'width'])
  })

  it('resetGenericProps with nothing but name / sel opens no transaction', () => {
    ;(resolvePropTarget as Mock).mockReturnValue({
      scene,
      target: { ...target, hasProp: () => true },
    })
    const res = services.resetGenericProps(ctx, {
      sceneId: 1, nodeId: 2, nodeType: 'renderer', propNames: ['name'],
    })
    expect(res.ok).toBe(false)
    expect(withUndoTxnSpy).not.toHaveBeenCalled()
    expect(resetProp).not.toHaveBeenCalled()
  })

  it('setGenericProps fails before the transaction when a write resets the name', () => {
    const res = services.setGenericProps(ctx, {
      sceneId: 1,
      nodeId: 2,
      nodeType: 'renderer',
      writes: [
        { propName: 'alpha', op: 'set', valueType: 'real', value: 0.5 },
        { propName: 'name', op: 'reset', valueType: '' },
      ],
    })
    expect(res.ok).toBe(false)
    expect(withUndoTxnSpy).not.toHaveBeenCalled()
    expect(setProp).not.toHaveBeenCalled()
  })
})
