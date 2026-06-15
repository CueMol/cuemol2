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
 * Tuned for macOS Chromium, where a physical mouse wheel emits large integer
 * vertical deltas (deltaX 0) and a trackpad emits small / fractional deltas,
 * usually with a horizontal component.
 */

export type WheelClassification = 'mouse' | 'trackpad' | 'unknown'

export interface WheelSample {
  /** WheelEvent.deltaMode (0=pixel, 1=line, 2=page). */
  deltaMode: number
  deltaX: number
  deltaY: number
}

/**
 * |deltaY| at or above which a vertical integer pixel delta is taken to be a
 * mouse wheel notch. Below this an integer delta is ambiguous ('unknown').
 */
export const MOUSE_COARSE_DELTA = 50

/**
 * Classify one wheel sample.
 *
 * Order matters: line/page deltas and a fractional or horizontal delta are
 * decisive; a large integer vertical-only pixel delta is a mouse notch;
 * everything else is 'unknown' so the detector keeps its current state.
 */
export function classifyWheelSample(s: WheelSample): WheelClassification {
  // Line / page deltas come from a classic mouse wheel; trackpads always report
  // pixel deltas (deltaMode 0).
  if (s.deltaMode !== 0) return 'mouse'
  // Horizontal component: a wheel mouse does not scroll sideways; a trackpad
  // two-finger scroll routinely does.
  if (s.deltaX !== 0) return 'trackpad'
  // Fractional vertical delta: trackpads emit sub-pixel precise deltas; a wheel
  // notch is an integer.
  if (s.deltaY !== 0 && !Number.isInteger(s.deltaY)) return 'trackpad'
  // Large integer vertical-only delta: a mouse wheel notch.
  if (Number.isInteger(s.deltaY) && Math.abs(s.deltaY) >= MOUSE_COARSE_DELTA) return 'mouse'
  // Small integer vertical delta (or zero): ambiguous.
  return 'unknown'
}
