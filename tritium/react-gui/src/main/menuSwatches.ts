/**
 * @file main/menuSwatches.ts
 * @description Colour swatches for the Scene > Background menu items.
 *
 * Drawn here rather than shipped as files: they are two flat squares, and a
 * generated bitmap avoids an asset that has to be found at runtime from both
 * a dev run and a packaged app.
 *
 * Each swatch carries a grey outline. Without it the white one disappears on
 * a light menu and the black one on a dark menu -- the outline is what makes
 * both readable either way.
 */

import { nativeImage, type NativeImage } from 'electron'

/** Point size of a menu swatch; drawn at 2x for retina displays. */
const SIZE_PT = 12
const SCALE = 2

type Rgb = readonly [number, number, number]

const OUTLINE: Rgb = [128, 128, 128]

/**
 * A filled square with a 1pt outline, as a BGRA bitmap.
 *
 * Electron takes the buffer in BGRA order, row-major, no padding.
 */
function swatch(fill: Rgb): NativeImage {
  const px = SIZE_PT * SCALE
  const border = SCALE
  const buf = Buffer.alloc(px * px * 4)
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const onEdge = x < border || y < border || x >= px - border || y >= px - border
      const [r, g, b] = onEdge ? OUTLINE : fill
      const i = (y * px + x) * 4
      buf[i] = b
      buf[i + 1] = g
      buf[i + 2] = r
      buf[i + 3] = 255
    }
  }
  return nativeImage.createFromBitmap(buf, { width: px, height: px, scaleFactor: SCALE })
}

/** Swatches by the name a menu item asks for, built once. */
const cache = new Map<string, NativeImage>()

const SWATCH_FILLS: Record<string, Rgb> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
}

/** The swatch for a menu item's `swatch` field, or undefined if unknown. */
export function menuSwatch(name: string): NativeImage | undefined {
  const fill = SWATCH_FILLS[name]
  if (!fill) return undefined
  let img = cache.get(name)
  if (!img) {
    img = swatch(fill)
    cache.set(name, img)
  }
  return img
}
