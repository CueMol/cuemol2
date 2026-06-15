/**
 * Per-event wheel classifier (mouse vs trackpad vs unknown).
 *
 * Pins the delta-signature rules so a threshold tweak is a deliberate, visible
 * change rather than a silent mis-binding of the wheel.
 */

import { describe, it, expect } from 'vitest'
import { classifyWheelSample, MOUSE_COARSE_DELTA } from '../input/wheelDeviceClassifier'

describe('classifyWheelSample', () => {
  it('line / page deltaMode is a mouse wheel (trackpads report pixels)', () => {
    expect(classifyWheelSample({ deltaMode: 1, deltaX: 0, deltaY: 3 })).toBe('mouse')
    expect(classifyWheelSample({ deltaMode: 2, deltaX: 0, deltaY: 1 })).toBe('mouse')
  })

  it('a horizontal component is a trackpad', () => {
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 5, deltaY: 0 })).toBe('trackpad')
    // horizontal wins even over a mouse-looking large integer vertical delta
    expect(classifyWheelSample({ deltaMode: 0, deltaX: -2, deltaY: 120 })).toBe('trackpad')
  })

  it('a fractional vertical delta is a trackpad', () => {
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: 4.5 })).toBe('trackpad')
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: -0.25 })).toBe('trackpad')
  })

  it('a large integer vertical-only delta is a mouse notch', () => {
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: 120 })).toBe('mouse')
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: -MOUSE_COARSE_DELTA })).toBe('mouse')
  })

  it('a small integer vertical delta (or zero) is ambiguous', () => {
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: MOUSE_COARSE_DELTA - 1 })).toBe('unknown')
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: 4 })).toBe('unknown')
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: 0 })).toBe('unknown')
  })
})
