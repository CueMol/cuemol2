import { describe, expect, it } from 'vitest'
import { compareVersions, parseVersion } from './version'

describe('compareVersions', () => {
  it('treats a build-only bump as newer (the reason electron-updater is not used)', () => {
    expect(compareVersions(parseVersion('v2.3.21.545')!, parseVersion('2.3.21.544')!)).toBeGreaterThan(0)
    expect(compareVersions(parseVersion('2.3.21.544')!, parseVersion('2.3.21.544')!)).toBe(0)
    expect(parseVersion('2.3.21')).toBeNull()
  })
})
