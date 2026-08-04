/**
 * @file main/helpers/appIcon.ts
 * @description Resolves the app icon for an UNPACKAGED (dev) run.
 *
 * A packaged build needs nothing from here: electron-builder reads the
 * per-platform icons out of the buildResources directory (build/icon.icns,
 * build/icon.ico, build/icon.png) and the OS takes the window / dock / taskbar
 * icon from the bundle, the .exe or the .desktop entry. Running unpackaged
 * there is no bundle, so Electron falls back to its own logo -- this points it
 * at the same artwork instead.
 *
 * It has to be the PNG: Electron's nativeImage reads PNG (and ICO on Windows)
 * only, and returns an EMPTY image for .icns -- verified on macOS. That is why
 * build/icon.png is tracked alongside the two platform icons rather than being
 * left as a build-time intermediate.
 *
 * build/ is not shipped inside the app, so the lookup is deliberately
 * dev-only and returns undefined once packaged.
 */

import { app, nativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

/** build/icon.png (512x512, tracked) relative to the compiled main bundle. */
const DEV_ICON_PATH = join(__dirname, '../../build/icon.png')

/**
 * Path to the dev-run icon, or undefined when packaged (or when the file is
 * missing, so a stripped checkout still starts).
 *
 * @returns An absolute PNG path suitable for `BrowserWindow`'s `icon` option.
 */
export function getDevIconPath(): string | undefined {
  if (app.isPackaged) return undefined
  return existsSync(DEV_ICON_PATH) ? DEV_ICON_PATH : undefined
}

/**
 * Point the macOS dock at the dev icon. `BrowserWindow`'s `icon` option is
 * ignored on macOS -- the dock icon comes from the bundle, which an
 * unpackaged run does not have -- so it has to be set explicitly.
 *
 * No-op off macOS and in a packaged build.
 */
export function applyDevDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  const iconPath = getDevIconPath()
  if (!iconPath) return
  const image = nativeImage.createFromPath(iconPath)
  if (!image.isEmpty()) app.dock.setIcon(image)
}
