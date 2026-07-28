/**
 * @file __test__/mainRenderHistory.test.ts
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
  readRenderImage,
  storeRenderImage,
} from '../../main/renderHistory';
import { RENDER_HISTORY_LIMIT } from '../../shared/renderHistory';

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
