/**
 * @file shared/movieFrames.ts
 * @description Naming of the frame files a movie render produces.
 *
 * Shared because three sides need to agree on it: the worker writes the
 * frames, the render window asks for one by index, and the main process
 * reads that file back for the result viewer's frame slider.
 */

/** File name of one frame of a rendered movie sequence. */
export function movieFrameFileName(baseName: string, frameIndex: number): string {
  return `${baseName}_frm_${String(frameIndex).padStart(4, '0')}.png`
}
