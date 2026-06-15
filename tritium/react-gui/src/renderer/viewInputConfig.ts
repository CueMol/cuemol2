/**
 * @file viewInputConfig.ts
 * @description Mapping between the persisted "pointing device" preference and
 * the ViewInputConfig style applied to the C++ view-input singleton.
 *
 * tritium runs in Chromium, where a trackpad two-finger scroll and a physical
 * mouse wheel both arrive as wheel events but want opposite bindings (a mouse
 * wheel zooms; a two-finger scroll pans). The user picks a device mode and the
 * matching style preset -- defined in data/default_style.xml -- is applied.
 */

export type InputDeviceMode = 'mouse' | 'trackpad'

export const DEFAULT_INPUT_DEVICE_MODE: InputDeviceMode = 'mouse'

/** View-type style ids defined in data/default_style.xml. */
const STYLE_BY_MODE: Record<InputDeviceMode, string> = {
  mouse: 'DefaultViewInConf',
  trackpad: 'TrackpadViewInConf',
}

/**
 * Full ViewInputConfig style string for a device mode, with the per-user
 * override layer (UserViewConf) appended (uxp_gui cuemol2.js parity).
 *
 * @param mode - the pointing-device mode
 * @returns the comma-joined style name passed to setViewInputConfigStyle
 */
export function viewInputStyleName(mode: InputDeviceMode): string {
  return `${STYLE_BY_MODE[mode]},UserViewConf`
}

/** Human-facing labels shown in the settings select. */
export const INPUT_DEVICE_LABELS: Record<InputDeviceMode, string> = {
  mouse: 'Mouse',
  trackpad: 'Mac trackpad',
}

/** Select options, in mode order. */
export const INPUT_DEVICE_OPTIONS: string[] = [
  INPUT_DEVICE_LABELS.mouse,
  INPUT_DEVICE_LABELS.trackpad,
]

/** Reverse-map a select label back to a device mode (default: mouse). */
export function inputDeviceModeFromLabel(label: string): InputDeviceMode {
  return label === INPUT_DEVICE_LABELS.trackpad ? 'trackpad' : 'mouse'
}

/** Normalize an unknown persisted value to a valid device mode. */
export function normalizeInputDeviceMode(value: unknown): InputDeviceMode {
  return value === 'trackpad' ? 'trackpad' : 'mouse'
}
