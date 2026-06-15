/**
 * @file input/inputDeviceDetector.ts
 * @description Stateful detector that turns a stream of wheel samples plus
 * pinch / rotate signals into a stable effective device ('mouse' | 'trackpad').
 *
 * Pure and framework-free (the clock is injected as `now`) so it is unit
 * testable without timers. Definitive trackpad signals (pinch / rotate) switch
 * immediately and latch for a TTL, so a momentum tail of plain wheels cannot
 * flip back to mouse. Switching to mouse requires a streak of clean mouse-like
 * wheels AND no recent trackpad evidence (hysteresis -> no flapping).
 */

import type { InputDeviceMode } from '../viewInputConfig'
import { classifyWheelSample, type WheelSample } from './wheelDeviceClassifier'

/** Consecutive mouse-like wheels needed to switch trackpad -> mouse. */
export const MOUSE_CONFIRM_STREAK = 3
/** A pinch / rotate (or trackpad wheel) keeps "trackpad" latched this long (ms). */
export const TRACKPAD_EVIDENCE_TTL_MS = 1500

export class InputDeviceDetector {
  private effective: InputDeviceMode
  private mouseStreak = 0
  private lastTrackpadTs = -Infinity

  constructor(seed: InputDeviceMode = 'mouse') {
    this.effective = seed
  }

  getEffective(): InputDeviceMode {
    return this.effective
  }

  /** Re-seed to a known device (e.g. when the persisted preference loads). */
  reset(seed: InputDeviceMode): void {
    this.effective = seed
    this.mouseStreak = 0
    this.lastTrackpadTs = -Infinity
  }

  /**
   * A definitive trackpad gesture (a ctrl+wheel pinch or a rotate-gesture).
   * Switches to trackpad immediately and refreshes the latch.
   */
  noteTrackpadGesture(now: number): InputDeviceMode {
    this.lastTrackpadTs = now
    this.mouseStreak = 0
    this.effective = 'trackpad'
    return this.effective
  }

  /** Feed one wheel sample; returns the (possibly updated) effective device. */
  feedWheel(sample: WheelSample, now: number): InputDeviceMode {
    const cls = classifyWheelSample(sample)
    if (cls === 'trackpad') {
      this.lastTrackpadTs = now
      this.mouseStreak = 0
      this.effective = 'trackpad'
    } else if (cls === 'mouse') {
      this.mouseStreak += 1
      const trackpadStale = now - this.lastTrackpadTs > TRACKPAD_EVIDENCE_TTL_MS
      if (this.mouseStreak >= MOUSE_CONFIRM_STREAK && trackpadStale) {
        this.effective = 'mouse'
      }
    }
    // 'unknown' -> keep current effective.
    return this.effective
  }
}
