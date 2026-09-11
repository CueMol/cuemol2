/**
 * @file __test__/renderImageViewer.test.tsx
 * @description Degrade-detection tests for the rendering window's image viewer.
 *
 * Three contracts, each one something that broke in practice:
 *  - the initial fit is applied in a layout effect (before paint), computed
 *    from the container size + image dimensions, WITHOUT waiting for the <img>
 *    to load. The tests never fire onLoad, so a regression to onLoad-only
 *    fitting would leave the viewer at 100% and fail here.
 *  - a new image keeps the framing instead of re-fitting.
 *  - an anchored zoom lands the anchor where it was pinned. This one runs
 *    against a fake layout, because the bug it pins was a coordinate-space
 *    mistake that jsdom's all-zero geometry cannot express.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { RenderImageViewer } from '@renderer/features/render/RenderImageViewer';

void React;
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Viewport the fake layout reports for .riv-scroll. */
const VIEW_W = 400;
const VIEW_H = 300;

let root: Root;
let container: HTMLDivElement;
let origW: PropertyDescriptor | undefined;
let origH: PropertyDescriptor | undefined;

beforeEach(() => {
  // jsdom reports clientWidth/clientHeight as 0 (no layout); pretend the
  // viewport is 400x300 so computeFit yields a real ratio.
  origW = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'clientWidth');
  origH = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => VIEW_W });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => VIEW_H });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
  if (origW) Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', origW);
  if (origH) Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', origH);
});

function mount(imgWidth: number, imgHeight: number): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <RenderImageViewer src="data:," imgWidth={imgWidth} imgHeight={imgHeight} name="scene1" />,
    );
  });
}

/** Re-render the SAME viewer instance with a different image. */
function rerender(imgWidth: number, imgHeight: number): void {
  act(() => {
    root.render(
      <RenderImageViewer src="data:," imgWidth={imgWidth} imgHeight={imgHeight} name="scene1" />,
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

// A render is usually the same scene again with one setting changed, so the
// zoom the user set is theirs to keep -- re-fitting made them zoom back in on
// every iteration. The viewer stays mounted between results (same component at
// the same position), so keeping the framing is the default and only an image
// of a DIFFERENT pixel size needs any work.
describe('RenderImageViewer -- framing survives a new image', () => {
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

  it('keeps the zoom when a new image of the same size arrives', () => {
    mount(800, 600);
    expect(readZoomPct()).toBe(50);
    zoomIn();
    const zoomed = readZoomPct();
    expect(zoomed).toBeGreaterThan(50);

    // A new render result at the same size: nothing about the layout changes,
    // so the zoom -- and the scroll offset the browser holds -- must survive.
    rerender(800, 600);
    expect(readZoomPct()).toBe(zoomed);
  });

  it('rescales the zoom by the fit ratio when the image size changes', () => {
    mount(800, 600);
    expect(readZoomPct()).toBe(50);

    // Twice the pixels for the same picture: half the zoom shows the same
    // region, so the framing is what is preserved, not the percentage.
    rerender(1600, 1200);
    expect(readZoomPct()).toBe(25);
  });
});

// Anchored zoom. The scroll offset that keeps the anchor in place is written
// after the stage has been re-laid out, and it used to be built from
// stage.offsetLeft/offsetTop -- which are relative to the nearest POSITIONED
// ancestor, not to the scroll container. .riv-scroll is not positioned, so the
// vertical offset carried the toolbar's height and every zoom jumped to the
// bottom of the image (the horizontal one was right only by luck). The fake
// layout below reproduces that geometry: a viewport inset from the top by the
// toolbar, and a stage whose offsetTop is measured past it.
describe('RenderImageViewer -- anchored zoom', () => {
  const TOOLBAR_H = 40;
  const saved: Record<string, PropertyDescriptor | undefined> = {};
  const scrolls = new WeakMap<HTMLElement, { l: number; t: number }>();
  const pos = (el: HTMLElement) => scrolls.get(el) ?? { l: 0, t: 0 };

  /** Stage size, as the component wrote it (imgWidth * scale). */
  const stageBox = (stage: HTMLElement) => ({
    w: parseFloat(stage.style.width) || 0,
    h: parseFloat(stage.style.height) || 0,
  });
  /** The `margin: auto` centring the stage gets while it fits the viewport. */
  const centring = (stage: HTMLElement) => {
    const { w, h } = stageBox(stage);
    return { x: Math.max(0, (VIEW_W - w) / 2), y: Math.max(0, (VIEW_H - h) / 2) };
  };

  beforeEach(() => {
    for (const k of ['scrollLeft', 'scrollTop', 'getBoundingClientRect', 'offsetLeft', 'offsetTop']) {
      saved[k] = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, k);
    }
    // jsdom keeps scroll offsets at 0; back them with real storage.
    Object.defineProperty(window.HTMLElement.prototype, 'scrollLeft', {
      configurable: true,
      get(this: HTMLElement) { return pos(this).l; },
      set(this: HTMLElement, v: number) { scrolls.set(this, { ...pos(this), l: v }); },
    });
    Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get(this: HTMLElement) { return pos(this).t; },
      set(this: HTMLElement, v: number) { scrolls.set(this, { ...pos(this), t: v }); },
    });
    Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: HTMLElement): DOMRect {
        const box = (x: number, y: number, w: number, h: number) =>
          ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) as DOMRect;
        if (this.classList.contains('riv-scroll')) return box(0, TOOLBAR_H, VIEW_W, VIEW_H);
        if (this.classList.contains('riv-stage')) {
          const el = this.parentElement as HTMLElement;
          const { w, h } = stageBox(this);
          const c = centring(this);
          return box(c.x - el.scrollLeft, TOOLBAR_H + c.y - el.scrollTop, w, h);
        }
        return box(0, 0, 0, 0);
      },
    });
    // Present only so a regression to the offsetLeft/offsetTop formula computes
    // a different answer: these are offsetParent-relative, so the vertical one
    // includes the toolbar the scroll container sits below.
    Object.defineProperty(window.HTMLElement.prototype, 'offsetLeft', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('riv-stage') ? centring(this).x : 0;
      },
    });
    Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('riv-stage') ? TOOLBAR_H + centring(this).y : 0;
      },
    });
  });

  afterEach(() => {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(window.HTMLElement.prototype, k, d);
      else delete (window.HTMLElement.prototype as unknown as Record<string, unknown>)[k];
    }
  });

  it('keeps the viewport centre put when the toolbar zooms in', () => {
    mount(800, 600); // fit 50% -> the stage is exactly the 400x300 viewport
    const el = container.querySelector('.riv-scroll') as HTMLElement;
    expect(el.scrollTop).toBe(0);

    act(() => {
      (container.querySelector('[aria-label="Zoom in"]') as HTMLElement).click();
    });

    // 0.5 * 1.25 -> stage 500x375, i.e. 100x75 of overflow. The image centre
    // was in the middle of the viewport and has to stay there, which is half
    // the overflow in each direction. The old offsetTop-based formula landed
    // at 77.5 here -- a toolbar's height too far down.
    expect(container.querySelector('.riv-stage')).toHaveProperty('style.width', '500px');
    expect(el.scrollLeft).toBe(50);
    expect(el.scrollTop).toBe(37.5);
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
