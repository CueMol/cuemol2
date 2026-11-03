/**
 * @file main/localApi/editLock.test.ts
 * @description The edit lock between local API clients: one command line's
 * runs are not interleaved with another client's, and a holder that dies
 * does not keep the lock.
 */

import { describe, expect, it } from 'vitest'
import { EDIT_LOCK_IDLE_MS, EditLock } from './editLock'

describe('EditLock', () => {
  it('turns other clients away between the runs of the holder, and lets them in after release', () => {
    const lock = new EditLock(() => 0)
    expect(lock.acquire('A')).toBe(true)
    // A's first run (opening a scene) ...
    lock.enter('A')!()
    // ... then, before A's next run, B's lone run and an MCP call are refused.
    expect(lock.enter()).toBeNull()
    expect(lock.enter('B')).toBeNull()
    expect(lock.acquire('B')).toBe(false)
    // A's next run goes into A's scene.
    const endA = lock.enter('A')
    expect(endA).not.toBeNull()
    endA!()
    lock.release('A')
    const endB = lock.enter()
    expect(endB).not.toBeNull()
    // A lone run holds it only while it runs.
    expect(lock.acquire('C')).toBe(false)
    endB!()
    expect(lock.acquire('C')).toBe(true)
  })

  it('lapses after the holder has been idle, never while one of its runs is in flight', () => {
    let now = 0
    const lock = new EditLock(() => now)
    lock.acquire('A')
    const end = lock.enter('A')!
    now += EDIT_LOCK_IDLE_MS * 10
    expect(lock.enter()).toBeNull()
    end()
    now += EDIT_LOCK_IDLE_MS - 1
    expect(lock.enter()).toBeNull()
    // A died without releasing: the lock goes once it has been idle long enough.
    now += 1
    expect(lock.acquire('B')).toBe(true)
    expect(lock.enter('A')).toBeNull()
  })
})
