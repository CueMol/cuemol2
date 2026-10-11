/**
 * @file version.ts
 * @description CueMol's four-part version (`major.minor.rev.build`).
 *
 * Releases are tagged `v2.3.21.544` and a release that only moves the build
 * number is common. electron-builder sees only the semver part (`2.3.21`), so
 * the comparison here is the reason the app does not use electron-updater:
 * there, a build-only bump is no update at all.
 */

/** A parsed four-part version. */
export type Version = readonly [number, number, number, number]

/**
 * Parse `2.3.21.544` (a leading `v` is accepted, as in the release tag).
 *
 * @returns the four numbers, or null when the text is not a four-part version
 */
export function parseVersion(text: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text.trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
}

/** Negative when `a` is older than `b`, 0 when equal, positive when newer. */
export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 4; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/** `2.3.21.544` */
export function formatVersion(v: Version): string {
  return v.join('.')
}
