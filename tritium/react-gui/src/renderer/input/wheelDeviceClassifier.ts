/**
 * @file input/wheelDeviceClassifier.ts
 * @description Per-event heuristic that classifies a single DOM wheel event as
 * coming from a mouse or a trackpad, from its delta signature.
 *
 * Electron 42 exposes no reliable OS signal for this: the observed
 * `input-event` carries no wheel deltas, and a trackpad two-finger scroll is
 * delivered as a plain `mouseWheel` identical to a real wheel. So the renderer
 * falls back to the classic delta heuristic. It is imperfect (weak on Windows
 * precision touchpads / high-resolution mice); the detector layer
 * (`inputDeviceDetector.ts`) adds hysteresis and a pinch/rotate "definitely
 * trackpad" latch on top, and a manual override always exists.
 *
 * Tuned for macOS Chromium, where a physical mouse wheel emits integer
 * vertical-only deltas and a trackpad emits fractional and/or horizontal
 * deltas. The integer-vs-fractional split is the discriminator; magnitude is
 * not reliable (a real mouse notch can be small).
 */

export type WheelClassification = 'mouse' | 'trackpad' | 'unknown'

export interface WheelSample {
  /** WheelEvent.deltaMode (0=pixel, 1=line, 2=page). */
  deltaMode: number
  deltaX: number
  deltaY: number
}

/**
 * Classify one wheel sample. A zero delta stays 'unknown' so the detector keeps
 * its current state; otherwise the integer-vs-fractional split decides.
 */
export function classifyWheelSample(s: WheelSample): WheelClassification {
  // Line / page deltas come from a classic mouse wheel; trackpads always report
  // pixel deltas (deltaMode 0).
  if (s.deltaMode !== 0) return 'mouse'
  // Horizontal component: a wheel mouse does not scroll sideways; a trackpad
  // two-finger scroll routinely does.
  if (s.deltaX !== 0) return 'trackpad'
  if (s.deltaY === 0) return 'unknown'
  // Fractional vertical delta: a trackpad's sub-pixel precise scroll.
  if (!Number.isInteger(s.deltaY)) return 'trackpad'
  // Integer vertical-only delta: a mouse wheel notch.
  return 'mouse'
}
