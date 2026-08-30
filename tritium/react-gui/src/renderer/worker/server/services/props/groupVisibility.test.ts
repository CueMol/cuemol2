/**
 * @file worker/server/services/props/groupVisibility.test.ts
 * @description Hiding a renderer group through the property bridge.
 *
 * A group's own `visible` flag draws nothing -- the C++ scene loop consults
 * each renderer's own flag -- so a surface that offers it as "hide this
 * group" has to carry the members with it, exactly as the scene tree's eye
 * toggle does. The raw property editor offers the property itself and must
 * not, which is why the cascade is something the caller asks for rather than
 * something the service decides.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { fakeObject, fakeRenderer, fakeScene, makeWorkerCtx } from '@renderer/worker/testing'
import { services } from './props.service'

const GROUP_UID = 50
const CHILD_UIDS = [101, 102]

function setup() {
  const group = fakeRenderer({ uid: GROUP_UID, name: 'grp1', type: '*group' })
  const children = CHILD_UIDS.map((uid) =>
    fakeRenderer({ uid, name: `rend${uid}`, type: 'simple', group: 'grp1' }),
  )
  // A renderer outside the group must not follow it.
  const outsider = fakeRenderer({ uid: 200, name: 'loose', type: 'simple' })
  const mol = fakeObject({ uid: 10, name: 'mol', renderers: [group, ...children, outsider] })
  const scene = fakeScene({ uid: 1, objects: [mol] })
  const { ctx } = makeWorkerCtx({ scenes: [scene] })
  return { ctx, group, children, outsider }
}

let env: ReturnType<typeof setup>
beforeEach(() => { env = setup() })

/** Write `visible: false` on the group, asking for the cascade or not. */
const hideGroup = (cascadeGroupVisibility?: boolean) =>
  services.setGenericProp(env.ctx, {
    sceneId: 1,
    nodeId: GROUP_UID,
    nodeType: 'rendGroup',
    propName: 'visible',
    op: 'set',
    valueType: 'boolean',
    value: false,
    ...(cascadeGroupVisibility === undefined ? {} : { cascadeGroupVisibility }),
  })

describe('rendGroup visibility through the property bridge', () => {
  it('carries the members when the caller asks for it', () => {
    expect(hideGroup(true).ok).toBe(true)
    // The group itself is written through the generic property bridge...
    expect(env.group.setProp).toHaveBeenCalledWith('visible', false)
    // ... and each member through its own flag, which is the one that draws.
    for (const child of env.children) {
      expect(child.sets.visible).toHaveBeenCalledWith(false)
    }
    // Only the group's own members follow.
    expect(env.outsider.sets.visible).not.toHaveBeenCalled()
  })

  it('writes only the named flag otherwise -- the raw editor edits one property', () => {
    expect(hideGroup().ok).toBe(true)
    expect(env.group.setProp).toHaveBeenCalledWith('visible', false)
    for (const child of env.children) {
      expect(child.sets.visible).not.toHaveBeenCalled()
    }
  })

  it('leaves the members alone for any other property of a group', () => {
    services.setGenericProp(env.ctx, {
      sceneId: 1,
      nodeId: GROUP_UID,
      nodeType: 'rendGroup',
      propName: 'alpha',
      op: 'set',
      valueType: 'real',
      value: 0.5,
      cascadeGroupVisibility: true,
    })
    for (const child of env.children) {
      expect(child.sets.visible).not.toHaveBeenCalled()
      expect(child.sets.alpha).not.toHaveBeenCalled()
    }
  })
})
