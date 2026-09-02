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
 * macOS has its own PNG, build/icon-mac.png: the macOS icon is a different
 * design (a rounded tile with a background) from the glyph the other
 * platforms use, so the dock cannot share icon.png without showing the wrong
 * artwork. Both PNGs come from scripts/make-icons.py.
 *
 * build/ is not shipped inside the app, so the lookup is deliberately
 * dev-only and returns undefined once packaged.
 */

import { app, nativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

/** build/icon.png (512x512, tracked) relative to the compiled main bundle. */
const DEV_ICON_PATH = join(__dirname, '../../build/icon.png')
/** build/icon-mac.png: the macOS artwork at the same 512px, for the dock. */
const DEV_ICON_MAC_PATH = join(__dirname, '../../build/icon-mac.png')

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
  if (process.platform !== 'darwin' || !app.dock || app.isPackaged) return
  // The dock shows the macOS artwork; the glyph is only the fallback so a
  // checkout without icon-mac.png still gets an icon rather than Electron's.
  const iconPath = existsSync(DEV_ICON_MAC_PATH) ? DEV_ICON_MAC_PATH : getDevIconPath()
  if (!iconPath) return
  const image = nativeImage.createFromPath(iconPath)
  if (!image.isEmpty()) app.dock.setIcon(image)
}
