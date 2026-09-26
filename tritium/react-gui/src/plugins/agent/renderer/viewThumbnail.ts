/**
 * @file plugins/agent/renderer/viewThumbnail.ts
 * @description A small copy of a picture the model was shown, for the transcript.
 *
 * The picture sent to the model is up to 1568 px and several hundred
 * kilobytes of base64. The transcript keeps every row for the session, so it
 * holds a JPEG scaled to fit the pane instead.
 */

import type { AgentViewImage } from '../shared/agentTypes'

/**
 * The thumbnail's longer side. About twice the pane's usual width, so it
 * stays sharp on a HiDPI display.
 */
const THUMB_LONG_SIDE = 480

/** The picture as a data URL, unscaled -- the fallback when scaling fails. */
function dataUrlOf(image: AgentViewImage): string {
  return `data:${image.mediaType};base64,${image.base64}`
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve(String(reader.result)) }
    reader.onerror = () => { reject(reader.error ?? new Error('read failed')) }
    reader.readAsDataURL(blob)
  })
}

/**
 * A scaled-down JPEG of `image`, as a data URL.
 *
 * @returns the original picture instead when it cannot be decoded or drawn,
 *   so a row never ends up without the picture it is about.
 */
export async function makeThumbnail(image: AgentViewImage): Promise<string> {
  try {
    const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: image.mediaType }))
    try {
      const scale = Math.min(1, THUMB_LONG_SIDE / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = new OffscreenCanvas(width, height)
      const g = canvas.getContext('2d')
      if (!g) return dataUrlOf(image)
      g.drawImage(bitmap, 0, 0, width, height)
      return await blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }))
    } finally {
      bitmap.close()
    }
  } catch (e) {
    console.warn('agent thumbnail:', e)
    return dataUrlOf(image)
  }
}
