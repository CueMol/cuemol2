/**
 * @file shared/movieFrames.ts
 * @description Naming of the frame files a movie render produces.
 *
 * Shared because three sides need to agree on it: the worker writes the
 * frames, the render window asks for one by index, and the main process
 * reads that file back for the result viewer's frame slider.
 */

/** Base name used when the user leaves the field empty. */
export const DEFAULT_MOVIE_BASE_NAME = 'movie'

/**
 * The base name the render actually writes with. The worker falls back to
 * DEFAULT_MOVIE_BASE_NAME for a blank field, so every side that names, counts
 * or deletes those files has to apply the same fallback -- otherwise a blank
 * field makes the clean-up look for `_frm_0000.png` while the render wrote
 * `movie_frm_0000.png`.
 */
export function resolveMovieBaseName(baseName: string): string {
  return baseName.trim() || DEFAULT_MOVIE_BASE_NAME
}

/** File name of one frame of a rendered movie sequence. */
export function movieFrameFileName(baseName: string, frameIndex: number): string {
  return `${baseName}_frm_${String(frameIndex).padStart(4, '0')}.png`
}

/**
 * Output-movie file extensions across all encode formats (see MOVIE_FORMAT_EXT
 * in renderSettings). Used by the clean-up to remove any encoded movie for a
 * base name regardless of the format it was made with.
 */
export const MOVIE_FILE_EXTENSIONS = ['.mov', '.mp4', '.wmv', '.gif'] as const

/**
 * Matcher for a frame file of any base name. Only safe in an app-managed
 * folder, where nothing but a render's own output lives; a user-picked folder
 * must always match against a specific base name (frameFileRegExp).
 */
export const ANY_FRAME_FILE_RE = /_frm_\d+\.png$/

/**
 * Matcher for every frame file of a base name, at any index.
 *
 * Shared so the three places that delete or count a sequence -- the worker's
 * pre-render purge, the main process' clean-up handler and the startup sweep --
 * cannot drift apart on what counts as "this render's frame".
 */
export function frameFileRegExp(baseName: string): RegExp {
  const esc = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${esc}_frm_\\d+\\.png$`)
}

/** Every possible encoded-movie file name for a base name (all formats). */
export function movieFileNames(baseName: string): Set<string> {
  return new Set(MOVIE_FILE_EXTENSIONS.map((ext) => `${baseName}${ext}`))
}

/** Whether a file name is a frame image or an encoded movie for a base name. */
export function isMovieArtifact(fileName: string, baseName: string): boolean {
  return frameFileRegExp(baseName).test(fileName) || movieFileNames(baseName).has(fileName)
}
