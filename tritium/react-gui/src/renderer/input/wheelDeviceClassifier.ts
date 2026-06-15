/**
 * @file input/wheelDeviceClassifier.ts
 * @description Per-event heuristic that classifies a single DOM wheel event as
 * coming from a mouse or a trackpad, from its delta signature.
 *
 * Electron 42 exposes no reliable OS signal for this: the observed
 * `input-event` carries no wheel deltas, and a trackpad two-finger scroll is
 * delivered as a plain `mouseWheel` identical to a real wheel. So the renderer
 * falls back to the classic delta heuristic. It is imperfect; the detector layer
 * (`inputDeviceDetector.ts`) adds hysteresis and a pinch/rotate "definitely
 * trackpad" latch on top, and a manual override always exists.
 *
 * The integer-vs-fractional split is the discriminator, but its polarity is
 * platform-specific. On macOS Chromium (verified on hardware) a mouse wheel is
 * scaled to a FRACTIONAL deltaY (e.g. 4.000244..., -160.81...) while a trackpad
 * reports INTEGER precise-pixel deltas (1, 4, 5, 7, ...). Off macOS there is no
 * validated split, so a clean vertical wheel reads as a mouse and a trackpad is
 * recognised only by a horizontal component (or a pinch/rotate gesture).
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
 * its current state.
 *
 * @param s - the wheel delta snapshot
 * @param isMac - whether the OS is macOS (selects the integer/fractional rule)
 */
export function classifyWheelSample(s: WheelSample, isMac: boolean): WheelClassification {
  // Line / page deltas come from a classic mouse wheel (mostly Windows/Firefox);
  // trackpads always report pixel deltas (deltaMode 0).
  if (s.deltaMode !== 0) return 'mouse'
  // A horizontal component is a trackpad two-finger scroll on any platform.
  if (s.deltaX !== 0) return 'trackpad'
  if (s.deltaY === 0) return 'unknown'
  if (isMac) {
    // macOS: a mouse wheel is scaled to a fractional deltaY; a trackpad emits
    // integer precise-pixel deltas.
    return Number.isInteger(s.deltaY) ? 'trackpad' : 'mouse'
  }
  // Off macOS the split is unvalidated, so a clean vertical wheel reads as a
  // mouse; a trackpad is caught above by its horizontal component (or by a
  // pinch/rotate gesture in the detector).
  return 'mouse'
}
