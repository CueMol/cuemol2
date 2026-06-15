/**
 * Stateful input-device detector: signals -> effective device, with hysteresis
 * and a pinch/rotate trackpad latch. Pins the no-flap and momentum-tail
 * behaviour so a constant tweak does not silently make the mode jitter.
 */

import { describe, it, expect } from 'vitest'
import {
  InputDeviceDetector,
  MOUSE_CONFIRM_STREAK,
  TRACKPAD_EVIDENCE_TTL_MS,
} from '../input/inputDeviceDetector'
import type { WheelSample } from '../input/wheelDeviceClassifier'

const MOUSE: WheelSample = { deltaMode: 0, deltaX: 0, deltaY: 120 } // large integer vertical
const TRACKPAD: WheelSample = { deltaMode: 0, deltaX: 3, deltaY: 8 } // has horizontal
const AMBIGUOUS: WheelSample = { deltaMode: 0, deltaX: 0, deltaY: 0 } // zero delta

describe('InputDeviceDetector', () => {
  it('seeds to the given device', () => {
    expect(new InputDeviceDetector('trackpad').getEffective()).toBe('trackpad')
    expect(new InputDeviceDetector('mouse').getEffective()).toBe('mouse')
  })

  it('a pinch / rotate gesture switches to trackpad immediately', () => {
    expect(new InputDeviceDetector('mouse').noteTrackpadGesture(1000)).toBe('trackpad')
  })

  it('a trackpad-like wheel switches to trackpad immediately', () => {
    expect(new InputDeviceDetector('mouse').feedWheel(TRACKPAD, 1000)).toBe('trackpad')
  })

  it('switches to mouse only after a streak of mouse-like wheels', () => {
    const d = new InputDeviceDetector('trackpad')
    let t = 10000 // no prior trackpad evidence (lastTrackpadTs = -Infinity)
    for (let i = 0; i < MOUSE_CONFIRM_STREAK - 1; i++) {
      expect(d.feedWheel(MOUSE, t++)).toBe('trackpad') // streak not reached yet
    }
    expect(d.feedWheel(MOUSE, t++)).toBe('mouse')
  })

  it('does not flip to mouse while trackpad evidence is fresh (momentum tail)', () => {
    const d = new InputDeviceDetector('mouse')
    d.noteTrackpadGesture(1000)
    // Within the TTL, even a full streak of mouse-like wheels stays trackpad.
    let t = 1100
    for (let i = 0; i < MOUSE_CONFIRM_STREAK + 2; i++) {
      expect(d.feedWheel(MOUSE, t++)).toBe('trackpad')
    }
    // Once the latch expires, mouse-like wheels are allowed to win.
    expect(d.feedWheel(MOUSE, 1000 + TRACKPAD_EVIDENCE_TTL_MS + 1)).toBe('mouse')
  })

  it('ambiguous samples never change the effective device', () => {
    expect(new InputDeviceDetector('trackpad').feedWheel(AMBIGUOUS, 5000)).toBe('trackpad')
    expect(new InputDeviceDetector('mouse').feedWheel(AMBIGUOUS, 5000)).toBe('mouse')
  })

  it('reset re-seeds and clears state', () => {
    const d = new InputDeviceDetector('mouse')
    d.noteTrackpadGesture(1000)
    d.reset('mouse')
    expect(d.getEffective()).toBe('mouse')
  })
})
