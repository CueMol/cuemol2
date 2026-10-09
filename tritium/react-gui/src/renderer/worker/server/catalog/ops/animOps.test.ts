/**
 * @file worker/server/catalog/ops/animOps.test.ts
 * @description How an animation command names an element: its number in
 * list_anims (from 1), #uid, or a name -- and a shared name is refused rather
 * than guessed.
 */

import { describe, it, expect } from 'vitest'
import type { AnimElement } from '@renderer/worker/shared/animTypes'
import { findElement } from './animOps'

function el(uid: number, name: string): AnimElement {
  return {
    index: 0, uid, name, type: 'SimpleSpin', disabled: false, timeRefName: '',
    startMs: 0, endMs: 1000, absStartMs: 0, absEndMs: 1000, quadric: 0, timeRefState: 'ok',
  }
}

describe('findElement', () => {
  it('takes a number from 1, #uid or a unique name', () => {
    const list = [el(37, 'spin'), el(38, 'wait'), el(39, 'wait')]
    expect(findElement(list, '1')).toBe(list[0])
    expect(findElement(list, '#39')).toBe(list[2])
    expect(findElement(list, 'spin')).toBe(list[0])
    expect(findElement(list, 'wait')).toMatch(/2 animation elements are named "wait"/)
    expect(findElement(list, '4')).toMatch(/1 to 3/)
  })
})
