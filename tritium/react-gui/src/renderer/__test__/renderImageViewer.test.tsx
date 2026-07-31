/**
 * @file __test__/renderImageViewer.test.tsx
 * @description Degrade-detection test for the Render Result image viewer.
 *
 * Pins the no-flicker contract: the initial fit is applied in a layout effect
 * (before paint), computed from the container size + image dimensions, WITHOUT
 * waiting for the <img> onLoad. The test never fires onLoad, so a regression to
 * onLoad-only fitting would leave the viewer at 100% and fail here.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { RenderImageViewer } from '../components/panes/RenderImageViewer';

void React;
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let origW: PropertyDescriptor | undefined;
let origH: PropertyDescriptor | undefined;

beforeEach(() => {
  // jsdom reports clientWidth/clientHeight as 0 (no layout); pretend the
  // viewport is 400x300 so computeFit yields a real ratio.
  origW = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'clientWidth');
  origH = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 400 });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 300 });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
  if (origW) Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', origW);
  if (origH) Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', origH);
});

function mount(imgWidth: number, imgHeight: number, fitKey?: string): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <RenderImageViewer src="data:," imgWidth={imgWidth} imgHeight={imgHeight} name="scene1" fitKey={fitKey} />,
    );
  });
}

/** Re-render the SAME viewer instance with a different fitKey / size. */
function rerender(imgWidth: number, imgHeight: number, fitKey?: string): void {
  act(() => {
    root.render(
      <RenderImageViewer src="data:," imgWidth={imgWidth} imgHeight={imgHeight} name="scene1" fitKey={fitKey} />,
    );
  });
}

/** Zoom percentage from the toolbar info text. */
function readZoomPct(): number {
  const info = container.querySelector('.riv-info')?.textContent ?? '';
  return Number(/(\d+)%/.exec(info)?.[1] ?? NaN);
}

describe('RenderImageViewer -- fit before paint', () => {
  it('fits on mount via the layout effect (not 100%) and shows scene/size/zoom info', () => {
    // 400/800 = 0.5 and 300/600 = 0.5 -> fit 50%. onLoad is never fired.
    mount(800, 600);
    const info = container.querySelector('.riv-info')?.textContent ?? '';
    expect(info).toContain('scene1');
    expect(info).toContain('800×600');
    expect(info).toContain('50%'); // fitted before paint, not the initial 100%
    // The stage is laid out at the fitted size (800x0.5, 600x0.5), not 100%.
    const stage = container.querySelector('.riv-stage') as HTMLElement;
    expect(stage.style.width).toBe('400px');
    expect(stage.style.height).toBe('300px');
  });
});

// A finished render should arrive fitted, not at whatever zoom the previous
// image was left at. The viewer stays mounted between results (same component
// at the same position), so without a fit key it would keep the old scale --
// which is exactly what users saw: a new render showing at 100%, or at some
// zoom inherited from the last one.
describe('RenderImageViewer -- re-fit on a new image', () => {
  /** Pinch-zoom in, so the current scale is clearly not the fitted one. */
  function zoomIn(): void {
    const el = container.querySelector('.riv-scroll') as HTMLElement;
    act(() => {
      el.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true, cancelable: true, deltaY: -300, ctrlKey: true, clientX: 200, clientY: 150,
        }),
      );
    });
  }

  it('re-fits when the fit key changes, even at an unchanged image size', () => {
    mount(800, 600, 'result-1');
    expect(readZoomPct()).toBe(50);
    zoomIn();
    expect(readZoomPct()).toBeGreaterThan(50);

    // A new render result at the same size: computeFit's identity is unchanged,
    // so only the key can tell the viewer this is a different image.
    rerender(800, 600, 'result-2');
    expect(readZoomPct()).toBe(50);
  });

  it('keeps the zoom while the key holds (movie frame scrubbing)', () => {
    mount(800, 600, 'result-1');
    zoomIn();
    const zoomed = readZoomPct();
    expect(zoomed).toBeGreaterThan(50);

    // Same result, next frame: the user's zoom is theirs to keep.
    rerender(800, 600, 'result-1');
    expect(readZoomPct()).toBe(zoomed);
  });

  it('fits once on mount when no key is given', () => {
    mount(800, 600);
    expect(readZoomPct()).toBe(50);
    zoomIn();
    const zoomed = readZoomPct();
    rerender(800, 600);
    expect(readZoomPct()).toBe(zoomed);
  });
});

// Trackpad zoom. A pinch reaches the page as a wheel event carrying a
// synthetic ctrlKey -- the only signal an element gets for it -- so that is
// what the viewer zooms on. A plain wheel must stay untouched: it is the
// two-finger swipe, and native scrolling is what pans the image.
describe('RenderImageViewer -- trackpad zoom', () => {
  /** Dispatch a wheel event on the scroll container, returning it. */
  function wheel(init: WheelEventInit): WheelEvent {
    const el = container.querySelector('.riv-scroll') as HTMLElement;
    const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    act(() => {
      el.dispatchEvent(ev);
    });
    return ev;
  }

  /** Zoom percentage from the toolbar info text. */
  function zoomPct(): number {
    const info = container.querySelector('.riv-info')?.textContent ?? '';
    return Number(/(\d+)%/.exec(info)?.[1] ?? NaN);
  }

  it('zooms in on a pinch (ctrl+wheel) and suppresses the browser page zoom', () => {
    mount(800, 600);
    expect(zoomPct()).toBe(50);

    const ev = wheel({ deltaY: -100, ctrlKey: true, clientX: 200, clientY: 150 });
    expect(zoomPct()).toBeGreaterThan(50);
    // Without preventDefault the OS/browser would zoom the whole page instead.
    expect(ev.defaultPrevented).toBe(true);
  });

  it('zooms out on the opposite pinch direction', () => {
    mount(800, 600);
    wheel({ deltaY: 100, ctrlKey: true, clientX: 200, clientY: 150 });
    expect(zoomPct()).toBeLessThan(50);
  });

  it('treats cmd/ctrl + wheel as zoom too', () => {
    mount(800, 600);
    wheel({ deltaY: -100, metaKey: true, clientX: 200, clientY: 150 });
    expect(zoomPct()).toBeGreaterThan(50);
  });

  it('leaves a plain wheel to scroll the container (that is the pan)', () => {
    mount(800, 600);
    const ev = wheel({ deltaY: -100, clientX: 200, clientY: 150 });
    expect(zoomPct()).toBe(50);
    // Not consumed, so the container scrolls natively.
    expect(ev.defaultPrevented).toBe(false);
  });

  it('does not zoom past the limits', () => {
    mount(800, 600);
    // Way past MAX_SCALE (8) in one gesture.
    wheel({ deltaY: -100000, ctrlKey: true, clientX: 200, clientY: 150 });
    expect(zoomPct()).toBe(800);
    wheel({ deltaY: 100000, ctrlKey: true, clientX: 200, clientY: 150 });
    expect(zoomPct()).toBe(5);
  });
});
