/**
 * @file main/movieOutput.test.ts
 * @description Lifetime rules for the app-managed movie output folders
 * (ADR-0043).
 *
 * These decide when a render's files disappear, so they are pinned rather than
 * left to the implementation: frames are the bulky, re-encode-only middle
 * product and go after a day, while the movie is the deliverable and survives
 * a month (or until it falls out of the newest few sessions). Two rules exist
 * purely to keep the sweep from destroying work: a folder another running
 * instance owns is never touched, and neither is anything outside the
 * app-managed root.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  FRAME_TTL_MS,
  MOVIE_SESSION_LIMIT,
  MOVIE_TTL_MS,
  sweepMovieSessions,
} from '@main/movieOutput';

/** Stand-in for the cuemol-movies root. */
let root: string;

/** Fixed "now" so ages are exact. */
const NOW = 1_800_000_000_000;

/** Create a session folder whose files are `ageMs` old. */
function makeSession(
  name: string,
  opts: { frames?: number; movie?: boolean; ageMs: number; pid?: number },
): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const files: string[] = ['.cuemol-session.json'];
  fs.writeFileSync(
    path.join(dir, '.cuemol-session.json'),
    JSON.stringify({ pid: opts.pid ?? 999_999, startedAt: NOW - opts.ageMs }),
  );
  for (let i = 0; i < (opts.frames ?? 0); i++) {
    const f = `movie_frm_${String(i).padStart(4, '0')}.png`;
    fs.writeFileSync(path.join(dir, f), 'frame');
    files.push(f);
  }
  if (opts.movie) {
    fs.writeFileSync(path.join(dir, 'movie.mp4'), 'movie');
    files.push('movie.mp4');
  }
  const t = (NOW - opts.ageMs) / 1000;
  for (const f of files) fs.utimesSync(path.join(dir, f), t, t);
  return dir;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'movie-sweep-test-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('movie output sweep', () => {
  it('keeps a recent session untouched', () => {
    const dir = makeSession('session-a', { frames: 3, movie: true, ageMs: HOUR });

    const res = sweepMovieSessions(root, NOW);

    expect(res).toEqual({ removedFrames: 0, removedDirs: 0 });
    expect(fs.readdirSync(dir).sort()).toContain('movie_frm_0000.png');
  });

  it('drops stale frames but keeps the movie they produced', () => {
    const dir = makeSession('session-a', {
      frames: 3,
      movie: true,
      ageMs: FRAME_TTL_MS + HOUR,
    });

    const res = sweepMovieSessions(root, NOW);

    expect(res.removedFrames).toBe(3);
    expect(res.removedDirs).toBe(0);
    expect(fs.existsSync(path.join(dir, 'movie.mp4'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'movie_frm_0000.png'))).toBe(false);
  });

  it('removes a stale session that never produced a movie', () => {
    const dir = makeSession('session-a', { frames: 2, ageMs: FRAME_TTL_MS + HOUR });

    const res = sweepMovieSessions(root, NOW);

    expect(res.removedDirs).toBe(1);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('removes a session once its movie is past the movie TTL', () => {
    const old = makeSession('session-old', { movie: true, ageMs: MOVIE_TTL_MS + DAY });
    const recent = makeSession('session-new', { movie: true, ageMs: DAY });

    sweepMovieSessions(root, NOW);

    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
  });

  it('keeps only the newest sessions holding a movie', () => {
    const dirs: string[] = [];
    for (let i = 0; i < MOVIE_SESSION_LIMIT + 3; i++) {
      // Newest first: session-0 is the most recent.
      dirs.push(makeSession(`session-${i}`, { movie: true, ageMs: HOUR * (i + 1) }));
    }

    sweepMovieSessions(root, NOW);

    const surviving = dirs.filter((d) => fs.existsSync(d));
    expect(surviving).toHaveLength(MOVIE_SESSION_LIMIT);
    expect(surviving).toEqual(dirs.slice(0, MOVIE_SESSION_LIMIT));
  });

  it('leaves a folder a running instance owns alone', () => {
    // This test process is alive by definition, so its pid stands in for a
    // second CueMol instance mid-render.
    const dir = makeSession('session-live', {
      frames: 3,
      ageMs: MOVIE_TTL_MS + DAY,
      pid: process.pid,
    });

    const res = sweepMovieSessions(root, NOW);

    expect(res).toEqual({ removedFrames: 0, removedDirs: 0 });
    expect(fs.existsSync(path.join(dir, 'movie_frm_0000.png'))).toBe(true);
  });

  it('ignores anything that is not a session folder', () => {
    const stray = path.join(root, 'not-a-session');
    fs.mkdirSync(stray);
    fs.writeFileSync(path.join(stray, 'movie_frm_0000.png'), 'frame');
    const t = (NOW - MOVIE_TTL_MS - DAY) / 1000;
    fs.utimesSync(path.join(stray, 'movie_frm_0000.png'), t, t);

    sweepMovieSessions(root, NOW);

    expect(fs.existsSync(path.join(stray, 'movie_frm_0000.png'))).toBe(true);
  });

  it('does nothing when the root does not exist yet', () => {
    expect(sweepMovieSessions(path.join(root, 'never-created'), NOW)).toEqual({
      removedFrames: 0,
      removedDirs: 0,
    });
  });
});
