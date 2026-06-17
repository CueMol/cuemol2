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

function mount(imgWidth: number, imgHeight: number): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<RenderImageViewer src="data:," imgWidth={imgWidth} imgHeight={imgHeight} />);
  });
}

describe('RenderImageViewer -- fit before paint', () => {
  it('fits on mount via the layout effect, not at 100%, without an img load', () => {
    // 400/800 = 0.5 and 300/600 = 0.5 -> fit 50%. onLoad is never fired.
    mount(800, 600);
    expect(container.querySelector('.riv-zoom-label')?.textContent).toBe('50%');
    // The stage is laid out at the fitted size (800x0.5, 600x0.5), not 100%.
    const stage = container.querySelector('.riv-stage') as HTMLElement;
    expect(stage.style.width).toBe('400px');
    expect(stage.style.height).toBe('300px');
  });
});
