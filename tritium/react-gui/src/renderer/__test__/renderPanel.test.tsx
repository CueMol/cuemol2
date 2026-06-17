/**
 * @file __test__/renderPanel.test.tsx
 * @description Degrade-detection tests for the RenderPanel Start-button gate.
 *
 * Pins the contract that the "Start Render" button is disabled (and cannot
 * fire onStart) when `canStart` is false -- the fix for a non-molview tab
 * leaving a pressable button that silently does nothing. While a job is active
 * the panel shows Stop instead, which is never gated by canStart.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { RenderPanel } from '../components/panels/RenderPanel';
import type { RenderJob } from '../hooks/useRenderJob';

void React;
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

const noop = (): void => {};

function mount(props: Partial<React.ComponentProps<typeof RenderPanel>>): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <RenderPanel
        job={null}
        canStart={true}
        preset="Current size"
        onStart={noop}
        onCancel={noop}
        onApplyPreset={noop}
        onOpenSettings={noop}
        {...props}
      />,
    );
  });
}

/** Find a <button> whose label contains the given text. */
function button(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(label),
  ) as HTMLButtonElement | undefined;
}

const RUNNING_JOB: RenderJob = {
  jobId: 'j1',
  status: 'running',
  progress: 50,
  phase: 'Rendering',
  log: [],
  startedAt: 0,
};

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
});

describe('RenderPanel -- Start button gating', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('disables Start and does not fire onStart when canStart is false', () => {
    const onStart = vi.fn();
    mount({ canStart: false, onStart });
    const start = button('Start Render');
    expect(start).toBeDefined();
    expect(start!.disabled).toBe(true);
    act(() => start!.click());
    expect(onStart).not.toHaveBeenCalled();
  });

  it('enables Start and fires onStart when canStart is true', () => {
    const onStart = vi.fn();
    mount({ canStart: true, onStart });
    const start = button('Start Render');
    expect(start).toBeDefined();
    expect(start!.disabled).toBe(false);
    act(() => start!.click());
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('shows Stop (not gated by canStart) while a job is active', () => {
    const onCancel = vi.fn();
    // canStart false, but an active job must still be stoppable.
    mount({ canStart: false, job: RUNNING_JOB, onCancel });
    expect(button('Start Render')).toBeUndefined();
    const stop = button('Stop');
    expect(stop).toBeDefined();
    expect(stop!.disabled).toBe(false);
    act(() => stop!.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
