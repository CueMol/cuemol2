/**
 * @file __test__/renderResultExport.test.tsx
 * @description Wiring contract for the result pane's Save / Copy buttons.
 *
 * These are the export path out of the Rendering window, and they were once
 * dropped as toolbar clutter -- so pin that they exist and that they act on
 * WHAT IS ON SCREEN: the archived render normally, or the frame the movie
 * slider is showing. The image itself lives on disk, so both are file
 * operations named by reference rather than by pixels.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import {
  mountTree,
  setupElectronAPI,
  teardownElectronAPI,
  flushPromises,
} from './helpers/testHarness';

void React;

vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}));
vi.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));

import {
  RenderResultPane,
  exportFileName,
  exportImageRef,
} from '../components/panes/RenderResultPane';
import { IPC } from '../../shared/ipcChannels';
import type { RenderResult } from '../data/renderResult';

const RESULT: RenderResult = {
  id: 'render-result-1',
  width: 800,
  height: 600,
  elapsedSec: 1,
  sourceSceneId: 1,
  sourceSceneName: 'SceneA',
  settingsSnapshot: {
    mode: 'still',
    backend: 'umbreon',
    commonProps: [],
    backendProps: [],
  },
};

const MOVIE_RESULT: RenderResult = {
  ...RESULT,
  movie: { frameCount: 5, outputDir: '/out', baseName: 'movie' },
};

let api: ReturnType<typeof setupElectronAPI>;

beforeEach(() => {
  api = setupElectronAPI({
    invoke: vi.fn((channel: string) => {
      if (channel === IPC.RENDER_FRAME_READ) {
        return Promise.resolve({ dataUrl: 'data:image/png;base64,FRAME' });
      }
      if (channel === IPC.RENDER_IMAGE_SAVE) return Promise.resolve({ canceled: true });
      if (channel === IPC.RENDER_IMAGE_COPY) return Promise.resolve({ ok: true });
      return Promise.resolve(undefined);
    }),
  });
});

afterEach(() => {
  teardownElectronAPI();
});

/** Click a toolbar button by its aria-label. */
function click(container: HTMLElement, label: string): void {
  const btn = container.querySelector(`button[aria-label="${label}"]`);
  expect(btn, `no button labelled "${label}"`).not.toBeNull();
  act(() => (btn as HTMLButtonElement).click());
}

/** Payload of the last invoke on `channel`. */
function lastCall(channel: string): Record<string, unknown> {
  const calls = (api.invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c) => c[0] === channel,
  );
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as Record<string, unknown>;
}

describe('RenderResultPane export actions', () => {
  it('saves the archived render, named after the scene and its size', () => {
    const { container, unmount } = mountTree(
      <RenderResultPane result={RESULT} imageSrc="data:image/png;base64,AA" />,
    );
    click(container, 'Save image');
    expect(lastCall(IPC.RENDER_IMAGE_SAVE)).toEqual({
      ref: { kind: 'result', resultId: 'render-result-1' },
      defaultName: 'SceneA-800x600.png',
    });
    unmount();
  });

  it('copies the archived render to the clipboard', () => {
    const { container, unmount } = mountTree(
      <RenderResultPane result={RESULT} imageSrc="data:image/png;base64,AA" />,
    );
    click(container, 'Copy image to clipboard');
    expect(lastCall(IPC.RENDER_IMAGE_COPY)).toEqual({
      ref: { kind: 'result', resultId: 'render-result-1' },
    });
    unmount();
  });

  it('exports the frame under the slider once one is shown', () => {
    // The rule lives in exportImageRef / exportFileName so it can be pinned
    // without driving Blueprint's slider through jsdom layout.
    expect(exportImageRef(MOVIE_RESULT, 2)).toEqual({
      kind: 'frame',
      outputDir: '/out',
      baseName: 'movie',
      frameIndex: 2,
    });
    expect(exportFileName(MOVIE_RESULT, 2)).toBe('SceneA-800x600-frame3.png');
    // Before the slider is touched, the archived render is what is on screen.
    expect(exportImageRef(MOVIE_RESULT, null)).toEqual({
      kind: 'result',
      resultId: 'render-result-1',
    });
  });

  it('exports the archived render for a still, whatever the frame index', () => {
    // A still has no frame sequence to point at.
    expect(exportImageRef(RESULT, 3)).toEqual({
      kind: 'result',
      resultId: 'render-result-1',
    });
    expect(exportFileName(RESULT, 3)).toBe('SceneA-800x600.png');
  });

  it('surfaces a failed export instead of looking like it worked', async () => {
    api.invoke = vi.fn((channel: string) =>
      channel === IPC.RENDER_IMAGE_COPY
        ? Promise.resolve({ ok: false, error: 'The rendered image is no longer available.' })
        : Promise.resolve(undefined),
    ) as never;
    const { container, unmount } = mountTree(
      <RenderResultPane result={RESULT} imageSrc="data:image/png;base64,AA" />,
    );
    click(container, 'Copy image to clipboard');
    await act(async () => { await flushPromises(); });
    // Blueprint renders the alert in a portal on document.body.
    expect(document.body.textContent).toContain('no longer available');
    unmount();
  });
});
