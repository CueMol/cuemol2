/**
 * @file shared/appInfo.test.ts
 * @description Pins the runtime app identity to what electron-builder stamps
 * on the package. The two are written in different files by hand, and a drift
 * is invisible until a Windows user sees two taskbar buttons (the shortcut's
 * AppUserModelID no longer matching the running process's).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { APP_ID, APP_PRODUCT_NAME } from '@shared/appInfo'

const builderYml = readFileSync(resolve(__dirname, '../../electron-builder.yml'), 'utf8')

/** Value of a top-level `key: value` line in electron-builder.yml. */
function topLevel(key: string): string | undefined {
  return builderYml.match(new RegExp(`^${key}:\\s*(\\S+)\\s*$`, 'm'))?.[1]
}

describe('app identity matches electron-builder.yml', () => {
  it('APP_ID is the packaged appId (the Windows AppUserModelID)', () => {
    expect(topLevel('appId')).toBe(APP_ID)
  })

  it('APP_PRODUCT_NAME is the packaged productName', () => {
    expect(topLevel('productName')).toBe(APP_PRODUCT_NAME)
  })
})
