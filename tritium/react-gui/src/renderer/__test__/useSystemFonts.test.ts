/**
 * Pins the system-font enumeration used by the settings font picker:
 *   - generics are listed first, system families deduped + sorted after
 *   - a generic that also appears in the system list is not duplicated
 *   - absent API / thrown query / empty result all fall back to the curated list
 */

import { describe, it, expect, vi } from 'vitest'
import { buildFontList, resolveFonts } from '@renderer/features/settings/useSystemFonts'
import {
  GENERIC_FONT_FAMILIES,
  FALLBACK_FONT_LIST,
} from '@renderer/features/settings/settings/labelFont'

describe('buildFontList', () => {
  it('lists generics first, then deduped case-insensitively-sorted system families', () => {
    const list = buildFontList(['Zapfino', 'Arial', 'Arial', 'Baskerville'])
    expect(list.slice(0, GENERIC_FONT_FAMILIES.length)).toEqual(GENERIC_FONT_FAMILIES)
    expect(list.slice(GENERIC_FONT_FAMILIES.length)).toEqual(['Arial', 'Baskerville', 'Zapfino'])
  })

  it('drops a system family that duplicates a generic (case-insensitive)', () => {
    const list = buildFontList(['Sans-Serif', 'Helvetica'])
    // 'Sans-Serif' collapses into the generic 'sans-serif'; only Helvetica remains.
    expect(list.filter((f) => f.toLowerCase() === 'sans-serif')).toEqual(['sans-serif'])
    expect(list).toContain('Helvetica')
  })

  it('ignores blank entries', () => {
    const list = buildFontList(['', '   ', 'Menlo'])
    expect(list).toEqual([...GENERIC_FONT_FAMILIES, 'Menlo'])
  })
})

describe('resolveFonts', () => {
  it('returns the fallback list when queryLocalFonts is unavailable', async () => {
    expect(await resolveFonts(undefined)).toEqual(FALLBACK_FONT_LIST)
  })

  it('returns the built system list when the query resolves', async () => {
    const query = vi.fn(async () => [{ family: 'Inter' }, { family: 'Roboto' }])
    const list = await resolveFonts(query)
    expect(list).toEqual([...GENERIC_FONT_FAMILIES, 'Inter', 'Roboto'])
  })

  it('falls back when the query throws', async () => {
    const query = vi.fn(async () => { throw new Error('permission denied') })
    expect(await resolveFonts(query)).toEqual(FALLBACK_FONT_LIST)
  })

  it('falls back when the query yields no families (blocked/empty)', async () => {
    const query = vi.fn(async () => [])
    expect(await resolveFonts(query)).toEqual(FALLBACK_FONT_LIST)
  })
})
