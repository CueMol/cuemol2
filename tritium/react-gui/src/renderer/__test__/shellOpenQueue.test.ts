/**
 * Pins the queue semantics that keep a launch-time shell open from being lost
 * or duplicated (main/shellOpenQueue.ts).
 *
 * The de-duplication scope is the subtle part: it must absorb macOS reporting
 * one file both in argv and via 'open-file', without blocking a user who
 * deliberately opens the same file again later.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  enqueueShellOpen,
  hasPendingShellOpen,
  resetShellOpenQueueForTests,
  takeShellOpen,
} from '../../main/shellOpenQueue'

beforeEach(() => {
  resetShellOpenQueueForTests()
})

describe('shellOpenQueue', () => {
  it('returns the queued batch and clears it', () => {
    enqueueShellOpen({ paths: ['/d/a.pdb', '/d/b.pdb'], missing: [] })
    expect(hasPendingShellOpen()).toBe(true)

    expect(takeShellOpen()).toEqual({ paths: ['/d/a.pdb', '/d/b.pdb'], missing: [] })
    expect(hasPendingShellOpen()).toBe(false)
    expect(takeShellOpen()).toEqual({ paths: [], missing: [] })
  })

  it('de-duplicates across enqueues while the batch is still queued', () => {
    // macOS launch: the same file arrives in argv and again as 'open-file'.
    enqueueShellOpen({ paths: ['/d/a.pdb'], missing: [] })
    enqueueShellOpen({ paths: ['/d/a.pdb', '/d/b.pdb'], missing: [] })
    expect(takeShellOpen().paths).toEqual(['/d/a.pdb', '/d/b.pdb'])
  })

  it('accepts the same path again once the batch has been taken', () => {
    // Re-opening a file the user already opened must still work.
    enqueueShellOpen({ paths: ['/d/a.pdb'], missing: [] })
    takeShellOpen()
    enqueueShellOpen({ paths: ['/d/a.pdb'], missing: [] })
    expect(takeShellOpen().paths).toEqual(['/d/a.pdb'])
  })

  it('tracks missing paths independently of openable ones', () => {
    enqueueShellOpen({ paths: [], missing: ['/d/gone.pdb'] })
    expect(hasPendingShellOpen()).toBe(true)
    enqueueShellOpen({ paths: ['/d/a.pdb'], missing: ['/d/gone.pdb'] })
    expect(takeShellOpen()).toEqual({ paths: ['/d/a.pdb'], missing: ['/d/gone.pdb'] })
  })

  it('ignores an empty enqueue', () => {
    enqueueShellOpen({ paths: [], missing: [] })
    expect(hasPendingShellOpen()).toBe(false)
  })
})
