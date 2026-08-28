/**
 * @file main/renderHistory.test.ts
 * @description Contract tests for the main-process render-history store.
 *
 * The store is what lets the Rendering window keep a deep history without
 * holding images in memory: it archives a finished render's PNG by result id,
 * hands it back on demand, and evicts the oldest past the limit so the temp
 * directory stays bounded. These pin the archive/read round trip, the eviction
 * order, and that a cleared store reports its images as gone.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  clearRenderHistory,
  sweepStaleRenderHistory,
  clearRenderWorkDirs,
  readRenderImage,
  registerRenderWorkDir,
  storeRenderImage,
} from '@main/renderHistory';
import { RENDER_HISTORY_LIMIT } from '@shared/renderHistory';

/** Directory holding the fake "rendered" PNGs a test archives from. */
let srcDir: string;

/** Write a source file whose bytes identify it, returning its path. */
function makeImage(name: string, body: string): string {
  const file = path.join(srcDir, `${name}.png`);
  fs.writeFileSync(file, body);
  return file;
}

beforeEach(() => {
  clearRenderHistory();
  srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-history-test-'));
});

afterEach(() => {
  clearRenderHistory();
  fs.rmSync(srcDir, { recursive: true, force: true });
});

describe('main render history store', () => {
  it('archives an image and reads it back as a data URL', () => {
    expect(storeRenderImage('render-result-1', makeImage('a', 'IMAGE-A'))).toBe(true);

    const dataUrl = readRenderImage('render-result-1');
    expect(dataUrl).not.toBeNull();
    expect(dataUrl!.startsWith('data:image/png;base64,')).toBe(true);
    // Round trips the actual bytes, not a placeholder.
    const b64 = dataUrl!.slice('data:image/png;base64,'.length);
    expect(Buffer.from(b64, 'base64').toString()).toBe('IMAGE-A');
  });

  it('reports an unknown id as missing rather than throwing', () => {
    expect(readRenderImage('never-rendered')).toBeNull();
  });

  it('fails without throwing when the source file is gone', () => {
    expect(storeRenderImage('render-result-1', path.join(srcDir, 'absent.png'))).toBe(
      false,
    );
    expect(readRenderImage('render-result-1')).toBeNull();
  });

  it('keeps the source file (the worker keeps its work dir for inspection)', () => {
    const src = makeImage('a', 'IMAGE-A');
    storeRenderImage('render-result-1', src);
    expect(fs.existsSync(src)).toBe(true);
  });

  it('evicts the oldest entries past the limit', () => {
    for (let i = 0; i < RENDER_HISTORY_LIMIT + 2; i++) {
      storeRenderImage(`render-result-${i}`, makeImage(`img-${i}`, `IMAGE-${i}`));
    }
    // The two oldest are gone; everything from there on is still readable.
    expect(readRenderImage('render-result-0')).toBeNull();
    expect(readRenderImage('render-result-1')).toBeNull();
    expect(readRenderImage('render-result-2')).not.toBeNull();
    expect(readRenderImage(`render-result-${RENDER_HISTORY_LIMIT + 1}`)).not.toBeNull();
  });

  it('re-archiving an id refreshes it instead of consuming another slot', () => {
    storeRenderImage('render-result-keep', makeImage('keep', 'KEEP'));
    // Fill the rest of the limit, re-archiving the first id along the way.
    for (let i = 0; i < RENDER_HISTORY_LIMIT - 1; i++) {
      storeRenderImage(`render-result-${i}`, makeImage(`img-${i}`, `IMAGE-${i}`));
      if (i === 0) storeRenderImage('render-result-keep', makeImage('keep2', 'KEEP2'));
    }
    // Without the refresh the re-archived id would have been the first evicted.
    const dataUrl = readRenderImage('render-result-keep');
    expect(dataUrl).not.toBeNull();
    const b64 = dataUrl!.slice('data:image/png;base64,'.length);
    expect(Buffer.from(b64, 'base64').toString()).toBe('KEEP2');
  });

  it('clearing the store makes its images unreadable', () => {
    storeRenderImage('render-result-1', makeImage('a', 'IMAGE-A'));
    clearRenderHistory();
    expect(readRenderImage('render-result-1')).toBeNull();
  });
});

// A still render's work directory outlives its job (the .pov / .inc are worth
// inspecting), which used to leave one directory per render in the temp dir
// forever. They are registered as their image is archived and go with the
// history, so clearing it -- or quitting -- reclaims them.
describe('main render history work directories', () => {
  /** A work directory under the temp dir, with a file in it. */
  function makeWorkDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-render-test-'));
    fs.writeFileSync(path.join(dir, 'render.png'), 'IMAGE');
    return dir;
  }

  it('deletes registered work directories when the history is cleared', () => {
    const dir = makeWorkDir();
    registerRenderWorkDir(dir);
    expect(fs.existsSync(dir)).toBe(true);

    clearRenderHistory();
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('deletes each directory once, tolerating one already gone', () => {
    const dir = makeWorkDir();
    registerRenderWorkDir(dir);
    registerRenderWorkDir(dir); // a re-report must not double-register
    fs.rmSync(dir, { recursive: true, force: true });

    expect(() => clearRenderWorkDirs()).not.toThrow();
  });

  it('records a registered directory in this run\'s index, for a later start to reclaim', () => {
    // The in-memory list dies with a crashed run, so the index on disk is what
    // makes its work directories identifiable afterwards. Reclaiming them is
    // the boot sweep's job now that each run owns a directory -- a crashed run
    // has a different pid, which is what marks it as reclaimable. The sweep
    // itself is covered under 'per-run isolation' below.
    const dir = makeWorkDir();
    registerRenderWorkDir(dir);

    const index = path.join(
      os.tmpdir(), 'cuemol-render-history', `run-${process.pid}`, 'workdirs.json',
    );
    const parsed = JSON.parse(fs.readFileSync(index, 'utf8')) as { pid: number; dirs: string[] };
    expect(parsed.pid).toBe(process.pid);
    expect(parsed.dirs).toContain(path.resolve(dir));
  });

  it('ignores a directory outside the temp dir', () => {
    // Guards the cleanup against ever deleting a user's own folder.
    const outside = path.join(srcDir, 'not-temp');
    fs.mkdirSync(outside);
    // srcDir IS under the temp dir in this test, so name a path that is not.
    registerRenderWorkDir(path.join(path.parse(outside).root, 'definitely-not-temp'));
    clearRenderWorkDirs();
    expect(fs.existsSync(outside)).toBe(true);
  });
});

/**
 * HISTORY_DIR is a fixed path under os.tmpdir() shared by every instance, and
 * CUEMOL_FRESH_PREFS deliberately gives a second instance its own
 * single-instance lock domain -- so it acquires the lock, reaches the startup
 * sweep, and used to delete the running instance's history and rm -rf its live
 * work directories. movieOutput.sweepMovieSessions already guarded this way.
 */
/**
 * HISTORY_DIR is a fixed path under os.tmpdir() shared by every instance, and
 * CUEMOL_FRESH_PREFS deliberately gives a second instance its own
 * single-instance lock domain -- so it acquires the lock, reaches the startup
 * sweep, and used to delete the running instance's history and rm -rf its live
 * work directories. movieOutput.sweepMovieSessions already guarded this way.
 */
/**
 * Two instances really do run at once: CUEMOL_FRESH_PREFS gives the second one
 * its own single-instance lock domain. They used to share one directory under
 * os.tmpdir(), so the second one's boot sweep deleted the first one's archived
 * images and rm -rf'd its live work directories.
 *
 * A marker file inside a shared directory cannot express ownership -- whichever
 * instance writes last owns it, and the marker only existed once a work
 * directory had been registered, so a run that had only archived images was
 * unprotected. Each run now owns its own directory instead, which makes the
 * separation structural.
 */
describe('per-run isolation', () => {
  const root = (): string => path.join(os.tmpdir(), 'cuemol-render-history');
  const runDir = (pid: number): string => path.join(root(), `run-${pid}`);

  /** Plant a directory as if `pid` had written it. */
  function plantRun(pid: number, workDirs: string[] = []): string {
    const dir = runDir(pid);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'image.png'), 'PLANTED');
    fs.writeFileSync(path.join(dir, 'workdirs.json'), JSON.stringify({ pid, dirs: workDirs }));
    return dir;
  }

  it('archives into this run own directory', () => {
    expect(storeRenderImage('own-1', makeImage('own', 'X'))).toBe(true);
    expect(fs.existsSync(runDir(process.pid))).toBe(true);
  });

  it('leaves a live instance directory alone', () => {
    // The parent process: alive, and not us -- the shape of a second instance
    // finding the first one's directory. (Portable, unlike pid 1.)
    const live = plantRun(process.ppid);
    const liveWork = path.join(srcDir, 'live-work');
    fs.mkdirSync(liveWork, { recursive: true });
    fs.writeFileSync(path.join(live, 'workdirs.json'), JSON.stringify({ pid: process.ppid, dirs: [liveWork] }));

    sweepStaleRenderHistory();

    expect(fs.existsSync(live)).toBe(true);
    expect(fs.existsSync(liveWork)).toBe(true);
    fs.rmSync(live, { recursive: true, force: true });
  });

  it('removes a dead run directory and the work dirs it registered', () => {
    const deadWork = path.join(srcDir, 'dead-work');
    fs.mkdirSync(deadWork, { recursive: true });
    // A pid no live process can hold on any supported platform.
    const dead = plantRun(2147483646, [deadWork]);

    sweepStaleRenderHistory();

    expect(fs.existsSync(dead)).toBe(false);
    expect(fs.existsSync(deadWork)).toBe(false);
  });

  it('never removes its own directory during the boot sweep', () => {
    storeRenderImage('own-2', makeImage('own2', 'Y'));
    sweepStaleRenderHistory();
    expect(readRenderImage('own-2')).not.toBeNull();
  });

  it('clearRenderHistory removes only this run', () => {
    storeRenderImage('own-3', makeImage('own3', 'Z'));
    const live = plantRun(process.ppid);

    clearRenderHistory();

    expect(fs.existsSync(runDir(process.pid))).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
    fs.rmSync(live, { recursive: true, force: true });
  });
});
