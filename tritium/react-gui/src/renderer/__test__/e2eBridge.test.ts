/**
 * @file __test__/e2eBridge.test.ts
 * @description Pins the gate of the dev-only inspector bridge
 * (`window.__cuemolE2E`): only a page loaded with `?e2e=1` (main adds it
 * under CUEMOL_E2E=1) turns it on, so a normal launch never exposes it.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { isE2eEnabled } from '@renderer/shell/E2eBridge'

describe('isE2eEnabled', () => {
  afterEach(() => window.history.replaceState({}, '', '/'))

  it('is on only with the e2e=1 page query', () => {
    expect(isE2eEnabled()).toBe(false)
    window.history.replaceState({}, '', '/?e2e=0')
    expect(isE2eEnabled()).toBe(false)
    window.history.replaceState({}, '', '/?e2e=1')
    expect(isE2eEnabled()).toBe(true)
  })
})
