/**
 * Per-event wheel classifier (mouse vs trackpad vs unknown).
 *
 * Pins the delta-signature rules -- including the platform-specific
 * integer/fractional polarity -- so a tweak is a deliberate, visible change
 * rather than a silent mis-binding of the wheel.
 */

import { describe, it, expect } from 'vitest'
import { classifyWheelSample } from '../input/wheelDeviceClassifier'

describe('classifyWheelSample', () => {
  it('line / page deltaMode is a mouse wheel on any platform', () => {
    expect(classifyWheelSample({ deltaMode: 1, deltaX: 0, deltaY: 3 }, true)).toBe('mouse')
    expect(classifyWheelSample({ deltaMode: 2, deltaX: 0, deltaY: 1 }, false)).toBe('mouse')
  })

  it('a horizontal component is a trackpad on any platform', () => {
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 5, deltaY: 0 }, true)).toBe('trackpad')
    expect(classifyWheelSample({ deltaMode: 0, deltaX: -2, deltaY: 8 }, false)).toBe('trackpad')
  })

  it('macOS: a fractional deltaY is a scaled mouse wheel, an integer is a trackpad', () => {
    // Real captured values: mouse dy=4.000244..., trackpad dy=1,4,5,7,...
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: 4.000244140625 }, true)).toBe('mouse')
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: -160.81 }, true)).toBe('mouse')
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: 7 }, true)).toBe('trackpad')
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: 1 }, true)).toBe('trackpad')
  })

  it('non-macOS: a clean vertical wheel reads as a mouse (no validated split)', () => {
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: 120 }, false)).toBe('mouse')
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: 4.5 }, false)).toBe('mouse')
  })

  it('a zero delta is ambiguous', () => {
    expect(classifyWheelSample({ deltaMode: 0, deltaX: 0, deltaY: 0 }, true)).toBe('unknown')
  })
})
