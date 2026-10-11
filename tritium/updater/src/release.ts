/**
 * @file release.ts
 * @description The latest GitHub release, and the asset this machine would install.
 *
 * The repository is public, so the API needs no token. `releases/latest`
 * never returns a draft or a prerelease. One release carries every OS's
 * installer (and the CueMol2 archives); the asset is picked by its file name,
 * which makes the artifact names (release-artifact-identity.md) a contract
 * with this file. The macOS and Linux workflows attach their files
 * separately, so a release can briefly lack this OS's asset: that reads as
 * "no update yet", not as an error.
 */

import { compareVersions, formatVersion, parseVersion, type Version } from './version'

/** Where the app looks unless CUEMOL_UPDATE_FEED points elsewhere. */
export const DEFAULT_FEED_URL = 'https://api.github.com/repos/CueMol/cuemol2/releases/latest'

/** The installers an update can use, by OS and architecture. */
export type UpdatePlatform = 'darwin-arm64' | 'win32-x64' | 'linux-x64'

/** File name of each platform's installer asset. */
export const ASSET_PATTERNS: Record<UpdatePlatform, RegExp> = {
  'darwin-arm64': /^CueMol3-.*-macOS-arm64-Installer\.dmg$/,
  'win32-x64': /^CueMol3-.*-Windows-x64-Setup\.exe$/,
  'linux-x64': /^CueMol3-.*-Linux-x64\.AppImage$/,
}

/** The fields of the GitHub release JSON this module reads. */
export interface RawRelease {
  tag_name: string
  name?: string | null
  body?: string | null
  html_url: string
  assets: Array<{
    name: string
    browser_download_url: string
    size: number
    digest?: string | null
  }>
}

/** A release that is newer than the running app and has this OS's installer. */
export interface ReleaseInfo {
  /** `2.3.21.544` */
  version: string
  /** The release page, for a manual download. */
  htmlUrl: string
  /** Release notes (Markdown). */
  notes: string
  asset: {
    name: string
    url: string
    size: number
    /** `sha256:<hex>` as GitHub reports it. */
    digest: string
  }
}

/** Fetch the release JSON from `feedUrl`. */
export async function fetchLatestRelease(
  feedUrl: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<RawRelease> {
  const res = await fetchFn(feedUrl, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  })
  if (!res.ok) throw new Error(`release check failed: HTTP ${res.status}`)
  return (await res.json()) as RawRelease
}

/**
 * The update `raw` offers over `current`, or null when there is none: the
 * tag is not newer, or the release has no installer for `platform` (yet),
 * or that installer has no digest to verify it against.
 */
export function findUpdate(
  raw: RawRelease,
  current: Version,
  platform: UpdatePlatform,
): ReleaseInfo | null {
  const latest = parseVersion(raw.tag_name)
  if (!latest || compareVersions(latest, current) <= 0) return null
  const asset = raw.assets.find((a) => ASSET_PATTERNS[platform].test(a.name))
  if (!asset || !asset.digest) return null
  return {
    version: formatVersion(latest),
    htmlUrl: raw.html_url,
    notes: raw.body ?? '',
    asset: {
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
      digest: asset.digest,
    },
  }
}
