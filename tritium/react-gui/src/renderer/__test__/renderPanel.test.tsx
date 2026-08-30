/**
 * @file __test__/renderPanel.test.tsx
 * @description Degrade-detection tests for the RenderPanel run bar.
 *
 * Pins the contract that the render controls (Start button, Render Settings
 * shortcut) are disabled -- and Start cannot fire onStart -- when `renderable`
 * is false: the fix for a non-molview tab leaving pressable controls that
 * silently do nothing. While a job is active the panel shows Stop instead,
 * which is never gated.
 *
 * Also pins the panel's shape after the settings moved to the Render Settings
 * pane: the run bar carries the Backend dropdown next to Target, and the log is
 * the only thing below it (no settings columns, no disclosure step).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { RenderPanel } from '@renderer/features/render/RenderPanel';
import type { RenderJob } from '@renderer/features/render/useRenderJob';

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
        mode="still"
        onModeChange={noop}
        renderable={true}
        onStart={noop}
        onCancel={noop}
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

  it('disables every render control when not renderable', () => {
    const onStart = vi.fn();
    mount({ renderable: false, onStart });
    const start = button('Start Render');
    expect(start).toBeDefined();
    expect(start!.disabled).toBe(true);
    act(() => start!.click());
    expect(onStart).not.toHaveBeenCalled();
    // The Render Settings shortcut is gated too.
    expect(button('Render Settings')!.disabled).toBe(true);
  });

  it('enables every render control and fires onStart when renderable', () => {
    const onStart = vi.fn();
    mount({ renderable: true, onStart });
    const start = button('Start Render');
    expect(start).toBeDefined();
    expect(start!.disabled).toBe(false);
    act(() => start!.click());
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(button('Render Settings')!.disabled).toBe(false);
  });

  it('shows Stop (never gated by renderable) while a job is active', () => {
    const onCancel = vi.fn();
    // renderable false, but an active job must still be stoppable.
    mount({ renderable: false, job: RUNNING_JOB, onCancel });
    expect(button('Start Render')).toBeUndefined();
    const stop = button('Stop');
    expect(stop).toBeDefined();
    expect(stop!.disabled).toBe(false);
    act(() => stop!.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('hides the Render Settings shortcut when onOpenSettings is omitted', () => {
    // In the Rendering window the settings editor is permanently visible,
    // so the shortcut button is dropped by omitting the callback.
    mount({ onOpenSettings: undefined });
    expect(button('Render Settings')).toBeUndefined();
    // The other controls are unaffected.
    expect(button('Start Render')).toBeDefined();
  });
});

describe('RenderPanel -- backend selector in the run bar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the backend dropdown and reports a pick', () => {
    const onBackendChange = vi.fn();
    mount({
      backend: 'povray',
      backendIds: ['povray', 'umbreon'],
      onBackendChange,
    });
    expect(container.textContent).toContain('Backend');
    const select = container.querySelector(
      '.render-panel-backend-select select',
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe('povray');
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'povray',
      'umbreon',
    ]);
    act(() => {
      select.value = 'umbreon';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onBackendChange).toHaveBeenCalledWith('umbreon');
  });

  it('hides the dropdown when no backend is supplied', () => {
    mount({});
    expect(container.querySelector('.render-panel-backend-select')).toBeNull();
  });
});

describe('RenderPanel -- log fills the area below the run bar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the log without a disclosure step and hosts no settings columns', () => {
    mount({ job: { ...RUNNING_JOB, log: ['frame 1 done'] } });
    // The log body is rendered directly (it used to sit inside a Collapse
    // toggled by a "Log" button).
    expect(button('Log')).toBeUndefined();
    const log = container.querySelector('.render-panel-log');
    expect(log).not.toBeNull();
    expect(log!.textContent).toContain('frame 1 done');
    // The settings columns moved to the Render Settings pane.
    expect(container.querySelector('.image-settings-panel')).toBeNull();
    expect(container.querySelector('.movie-settings-panel')).toBeNull();
  });
});
