/**
 * @file hooks/useSystemFonts.ts
 * @description Enumerate installed font families via the Local Font Access API
 * (`window.queryLocalFonts()`, available in Electron/Chromium) for the settings
 * font picker. Mirrors the UXP behaviour of listing system fonts (UXP used
 * Gecko `nsIFontEnumerator`). Falls back to a curated cross-platform list when
 * the API is unavailable or the permission is denied, so the picker is never
 * empty.
 *
 * The query result is cached at module scope: enumerating fonts is comparatively
 * expensive and the set does not change during a session.
 */

import { useEffect, useState } from 'react'
import {
  GENERIC_FONT_FAMILIES,
  FALLBACK_FONT_LIST,
} from '../components/panes/settings/labelFont'

interface FontData {
  family: string
}

type QueryLocalFonts = () => Promise<FontData[]>

let cachedFonts: string[] | null = null
let inFlight: Promise<string[]> | null = null

/**
 * Dedupe family names, sort case-insensitively, and prepend the generic
 * families (dropping any system entry that duplicates a generic). Pure.
 */
export function buildFontList(families: string[]): string[] {
  const unique = Array.from(new Set(families.filter((f) => f.trim().length > 0)))
  unique.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  const genericsLower = new Set(GENERIC_FONT_FAMILIES.map((g) => g.toLowerCase()))
  return [...GENERIC_FONT_FAMILIES, ...unique.filter((f) => !genericsLower.has(f.toLowerCase()))]
}

/**
 * Resolve the font list from a `queryLocalFonts`-shaped function (cache-free,
 * for direct testing). Returns the curated fallback when the query is absent,
 * throws, or yields nothing usable.
 */
export async function resolveFonts(query?: QueryLocalFonts): Promise<string[]> {
  if (typeof query !== 'function') return FALLBACK_FONT_LIST
  try {
    const fonts = await query()
    const list = buildFontList(fonts.map((f) => f.family))
    return list.length > GENERIC_FONT_FAMILIES.length ? list : FALLBACK_FONT_LIST
  } catch {
    return FALLBACK_FONT_LIST
  }
}

async function loadSystemFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts
  if (inFlight) return inFlight
  inFlight = (async () => {
    const query = (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts
    cachedFonts = await resolveFonts(query)
    return cachedFonts
  })()
  return inFlight
}

/**
 * @returns the available font family names. Starts with the fallback list and
 * updates to the full system list once `queryLocalFonts` resolves.
 */
export function useSystemFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>(cachedFonts ?? FALLBACK_FONT_LIST)

  useEffect(() => {
    if (cachedFonts) {
      setFonts(cachedFonts)
      return
    }
    let cancelled = false
    loadSystemFonts().then((list) => {
      if (!cancelled) setFonts(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return fonts
}
