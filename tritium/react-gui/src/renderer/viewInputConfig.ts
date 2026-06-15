/**
 * @file viewInputConfig.ts
 * @description Mapping between the persisted "pointing device" preference and
 * the ViewInputConfig style applied to the C++ view-input singleton.
 *
 * tritium runs in Chromium, where a trackpad two-finger scroll and a physical
 * mouse wheel both arrive as wheel events but want opposite bindings (a mouse
 * wheel zooms; a two-finger scroll pans). The user picks a device preference
 * (mouse / trackpad / auto) and the matching style preset -- defined in
 * data/default_style.xml -- is applied. 'auto' detects the device from the
 * wheel-event stream (see input/inputDeviceDetector.ts).
 *
 * Two type layers: the persisted PREFERENCE is 3-valued (InputDevicePreference,
 * includes 'auto'); the applied/effective device is 2-valued (InputDeviceMode)
 * and is the only thing that maps to a C++ preset.
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

// --- Preference layer (persisted): the 3-value choice exposed in Settings ---

/**
 * Persisted pointing-device preference. 'auto' detects mouse vs trackpad from
 * the wheel-event stream; 'mouse'/'trackpad' pin a preset manually. The applied
 * preset is always an `InputDeviceMode` (the 2-value effective device).
 */
export type InputDevicePreference = InputDeviceMode | 'auto'

export const DEFAULT_INPUT_DEVICE_PREFERENCE: InputDevicePreference = 'auto'

/** Human-facing labels for the three preference options. */
export const INPUT_DEVICE_PREF_LABELS: Record<InputDevicePreference, string> = {
  mouse: INPUT_DEVICE_LABELS.mouse,
  trackpad: INPUT_DEVICE_LABELS.trackpad,
  auto: 'Auto-detect',
}

/** Select options, in preference order (auto last). */
export const INPUT_DEVICE_PREF_OPTIONS: string[] = [
  INPUT_DEVICE_PREF_LABELS.mouse,
  INPUT_DEVICE_PREF_LABELS.trackpad,
  INPUT_DEVICE_PREF_LABELS.auto,
]

/** Reverse-map a select label back to a preference (default: auto). */
export function inputDevicePreferenceFromLabel(label: string): InputDevicePreference {
  if (label === INPUT_DEVICE_PREF_LABELS.mouse) return 'mouse'
  if (label === INPUT_DEVICE_PREF_LABELS.trackpad) return 'trackpad'
  return 'auto'
}

/** Normalize an unknown persisted value to a valid preference (default: auto). */
export function normalizeInputDevicePreference(value: unknown): InputDevicePreference {
  return value === 'mouse' || value === 'trackpad' ? value : 'auto'
}
