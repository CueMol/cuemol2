/**
 * @file worker/server/services/renderjob/encodeSpec.ts
 * @description Deciding what ffmpeg run a movie job needs, if any.
 *
 * Separate from the movie job's state machine (movieJob.ts) because these are
 * questions with answers -- is there an encode, where is ffmpeg, what
 * options -- rather than transitions.
 */
import * as fs from "fs";
import type { RenderStartArgs } from "@renderer/worker/shared/renderTypes";
import { type FfmpegEncodeOptions } from "./ffmpegEncode";
import { expandHomePath } from "./fsUtil";
import type { RenderJobEntry } from "./types";
/**
 * Whether this job should encode a movie. ffmpeg itself is checked before the
 * first frame is rendered (see resolveFfmpeg / startAnimJob), so by the time
 * the sequence is done the binary is known to be usable.
 */
export function shouldEncode(args: RenderStartArgs): boolean {
  return Boolean(args.snapshot.movie?.makeMovie);
}

/**
 * Resolve the configured ffmpeg binary, or say why it cannot be used.
 *
 * Checked up front rather than at encode time: an animation render can take
 * hours, and discovering only then that the encoder is missing wastes all of
 * it. A missing path is an error rather than a silent skip -- "render the
 * frames but no movie" is what the Encode movie switch is for.
 */
export function resolveFfmpeg(args: RenderStartArgs): { path: string } | { error: string } {
  const configured = args.binaries.ffmpeg?.trim();
  if (!configured) {
    return { error: "No ffmpeg executable is configured (Settings > Rendering)" };
  }
  const exe = expandHomePath(configured);
  if (!fs.existsSync(exe)) return { error: `ffmpeg not found: ${exe}` };
  return { path: exe };
}

/** ffmpeg options for this job, from the frames on disk and the snapshot. */
export function encodeOptions(entry: RenderJobEntry, args: RenderStartArgs): FfmpegEncodeOptions {
  const anim = entry.anim!;
  const movie = args.snapshot.movie!;
  return {
    outputDir: anim.outputDir,
    baseName: anim.baseName,
    fps: movie.fps,
    frameCount: anim.framePaths.length,
    format: movie.movieFormat,
    bitrateKbps: movie.bitrateKbps,
  };
}
