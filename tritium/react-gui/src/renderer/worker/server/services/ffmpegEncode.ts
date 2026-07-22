/**
 * @file worker/server/services/ffmpegEncode.ts
 * @description Build the ffmpeg command that encodes a rendered PNG frame
 * sequence into a movie.
 *
 * Ports the argument construction of UXP `anim-render-dlg.js`
 * (`onOutFmtChg` / `submitFFmpegTasks`): input frame rate, the `%04d` frame
 * pattern, null audio, frame count, optional bit rate, the per-format codec /
 * container options, an fps (and yuv420p for h264/h265) video filter, and
 * overwrite. Paths are double-quoted so a folder with spaces survives the
 * ProcessManager command-line split.
 */

import * as path from "path";

import { movieFrameFileName } from "../../../../shared/movieFrames";
import { MOVIE_FORMAT_EXT, type MovieFormatId } from "../../../data/renderSettings";

/** Codec / container options per format (UXP `onOutFmtChg`). */
const FORMAT_MAIN_OPT: Record<MovieFormatId, string> = {
  mov_h264: "-c:v libx264 -f mov",
  mov_h265: "-c:v libx265 -tag hvc1 -f mov",
  mov_raw: "-c:v rawvideo -f mov",
  mp4_h264: "-c:v libx264 -f mp4",
  mp4_h265: "-c:v libx265 -f mp4",
  wmv2: "-c:v wmv2",
  gifanim: "",
};

/** The movie output file name for a base name and format. */
export function movieFileName(baseName: string, format: MovieFormatId): string {
  return `${baseName}${MOVIE_FORMAT_EXT[format]}`;
}

export interface FfmpegEncodeOptions {
  /** Folder holding the frames; the movie is written here too. */
  outputDir: string;
  /** Base name of the frame files and the movie. */
  baseName: string;
  /** Frames per second (input and output). */
  fps: number;
  /** Number of frames in the sequence. */
  frameCount: number;
  /** Container / codec. */
  format: MovieFormatId;
  /** Encoding bit rate in kbps (ignored for the raw codec). */
  bitrateKbps: number;
}

/** Absolute path of the encoded movie for these options. */
export function movieOutputPath(opts: FfmpegEncodeOptions): string {
  return path.join(opts.outputDir, movieFileName(opts.baseName, opts.format));
}

/**
 * Build the ffmpeg argument string. The frame pattern mirrors what the render
 * loop wrote: `<base>_frm_%04d.png` in `outputDir`.
 */
export function buildFfmpegArgs(opts: FfmpegEncodeOptions): string {
  const framePattern = path.join(
    opts.outputDir,
    // movieFrameFileName pads to 4 digits; reproduce its stem with %04d.
    movieFrameFileName(opts.baseName, 0).replace(/0000\.png$/, "%04d.png"),
  );
  const mainOpt = FORMAT_MAIN_OPT[opts.format];
  const useYuv = mainOpt.includes("libx264") || mainOpt.includes("libx265");
  const pixFmt = useYuv ? ",format=yuv420p" : "";

  const args: string[] = [
    `-r ${opts.fps}`,
    `-i "${framePattern}"`,
    "-an",
    `-vframes ${opts.frameCount}`,
  ];
  // The raw codec carries no bit rate (UXP skips it for mov_raw).
  if (opts.format !== "mov_raw") {
    args.push(`-b:v ${opts.bitrateKbps}k`);
  }
  if (mainOpt) args.push(mainOpt);
  args.push(`-vf "fps=${opts.fps}${pixFmt}"`);
  args.push("-y");
  args.push(`"${movieOutputPath(opts)}"`);

  return args.join(" ");
}
