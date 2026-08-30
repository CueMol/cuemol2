/**
 * @file worker/server/services/renderjob/fsUtil.ts
 * @description Filesystem work a render job does outside the backends.
 *
 * Together with the APBS service this is the only place in the worker that
 * reaches for `fs` / `os` / `path` directly.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { frameFileRegExp, movieFileNames } from "@shared/movieFrames";
/** Expand a leading `~` to the user's home directory. */
export function expandHomePath(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

/** Remove a working directory, ignoring errors. */
export function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Delete a base name's frame images and encoded movies from a folder.
 *
 * Run before an animation render so the folder describes exactly one sequence.
 * Frames left by an earlier, longer render would otherwise survive past the new
 * sequence's end, where they inflate the re-encode frame count and -- if that
 * render used a different image size -- make ffmpeg abort partway.
 *
 * @returns how many files were removed.
 */
export function purgeMovieArtifacts(outputDir: string, baseName: string): number {
  const frameRe = frameFileRegExp(baseName);
  const movieNames = movieFileNames(baseName);
  let removed = 0;
  let names: string[];
  try {
    names = fs.readdirSync(outputDir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!frameRe.test(name) && !movieNames.has(name)) continue;
    try {
      fs.rmSync(path.join(outputDir, name), { force: true });
      removed++;
    } catch {
      /* leave files we cannot remove; the render overwrites what it reaches */
    }
  }
  return removed;
}
