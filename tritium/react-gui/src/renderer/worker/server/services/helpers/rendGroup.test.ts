/**
 * @file worker/server/services/helpers/rendGroup.test.ts
 * @description Pins the guard that keeps a renderer from vanishing out of the
 * scene tree.
 *
 * `Renderer.group` is a plain writable string and the Inspector lists every
 * property `getPropsJSON` reports, so a user can type any value into it. A
 * value naming no existing group removes the renderer from
 * `getGroupedRendListJSON` entirely -- it keeps drawing but is unreachable
 * from the tree, so it cannot be selected, hidden or deleted again.
 */

import { describe, it, expect } from 'vitest'
import { checkGroupAssignment, collectGroupMemberUids, isRendGroup } from './rendGroup'
import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer'

interface FakeRend {
  uid: number
  name: string
  type_name: string
  group: string
}

function makeObject(rends: FakeRend[]) {
  const client = {
    rend_uids: rends.map((r) => r.uid).join(','),
    name: 'mol1',
  }
  const wrap = (r: FakeRend) => ({ ...r, getClientObj: () => client })
  const wrapped = rends.map(wrap)
  const scene = {
    getRenderer: (uid: number) => wrapped.find((r) => r.uid === uid) ?? null,
  } as unknown as Scene
  return { scene, rend: (uid: number) => wrapped.find((r) => r.uid === uid) as unknown as Renderer }
}

const SIMPLE = { uid: 1, name: 'simple1', type_name: 'simple', group: '' }
const GROUP = { uid: 2, name: 'Group A', type_name: '*group', group: '' }
const GROUP2 = { uid: 3, name: 'Group B', type_name: '*group', group: '' }

describe('isRendGroup', () => {
  it('recognises a renderer group by its C++ type name', () => {
    const { rend } = makeObject([SIMPLE, GROUP])
    expect(isRendGroup(rend(2))).toBe(true)
    expect(isRendGroup(rend(1))).toBe(false)
  })
})

describe('checkGroupAssignment', () => {
  it('allows clearing the group', () => {
    const { scene, rend } = makeObject([SIMPLE, GROUP])
    expect(checkGroupAssignment(scene, rend(1), '')).toBeNull()
    expect(checkGroupAssignment(scene, rend(1), '   ')).toBeNull()
  })

  it('allows a group that exists on the same object', () => {
    const { scene, rend } = makeObject([SIMPLE, GROUP])
    expect(checkGroupAssignment(scene, rend(1), 'Group A')).toBeNull()
  })

  it('rejects a name that matches no group', () => {
    const { scene, rend } = makeObject([SIMPLE, GROUP])
    expect(checkGroupAssignment(scene, rend(1), 'Gx')).toMatch(/no renderer group/i)
  })

  it('rejects a name that matches a non-group renderer', () => {
    const { scene, rend } = makeObject([SIMPLE, GROUP])
    expect(checkGroupAssignment(scene, rend(1), 'simple1')).toMatch(/no renderer group/i)
  })

  it('rejects nesting one group inside another', () => {
    const { scene, rend } = makeObject([GROUP, GROUP2])
    expect(checkGroupAssignment(scene, rend(2), 'Group B')).toMatch(/cannot be nested/i)
  })

  it('rejects a group naming itself', () => {
    const { scene, rend } = makeObject([SIMPLE, GROUP])
    expect(checkGroupAssignment(scene, rend(2), 'Group A')).toMatch(/cannot be nested/i)
  })
})

describe('collectGroupMemberUids', () => {
  it('unions live members with the caller snapshot and drops the group itself', () => {
    const rends = [
      { uid: 1, name: 'r1', type_name: 'simple', group: 'Group A' },
      { uid: 2, name: 'Group A', type_name: '*group', group: '' },
      // Added to the group after the renderer fetched its tree snapshot.
      { uid: 4, name: 'r4', type_name: 'simple', group: 'Group A' },
      { uid: 5, name: 'r5', type_name: 'simple', group: '' },
    ]
    const { scene, rend } = makeObject(rends)
    // The caller only knew about uid 1, and wrongly included the group itself.
    const out = collectGroupMemberUids(scene, rend(2), [1, 2])
    expect(out.sort()).toEqual([1, 4])
  })

  it('works with no snapshot at all', () => {
    const rends = [
      { uid: 1, name: 'r1', type_name: 'simple', group: 'Group A' },
      { uid: 2, name: 'Group A', type_name: '*group', group: '' },
    ]
    const { scene, rend } = makeObject(rends)
    expect(collectGroupMemberUids(scene, rend(2))).toEqual([1])
  })
})
