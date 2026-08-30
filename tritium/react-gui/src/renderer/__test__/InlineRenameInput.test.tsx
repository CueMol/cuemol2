import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { mountTree } from '@renderer/__test__/helpers/testHarness';
import { InlineRenameInput } from '@renderer/features/scene/InlineRenameInput';

void React;

/**
 * Degrade-detection test for InlineRenameInput -- the inline-rename editor
 * extracted from ScenePane. Pins the commit / cancel keys and
 * that the inner <input> is exposed through `inputRef` (ScenePane focuses
 * it when the editor opens).
 */

function makeRef(): React.MutableRefObject<HTMLInputElement | null> {
  return { current: null };
}

function fireKey(el: Element, key: string): void {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

describe('InlineRenameInput', () => {
  it('commits the current value on Enter', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const { container, unmount } = mountTree(
      <InlineRenameInput
        inputRef={makeRef()}
        defaultValue="orig"
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    fireKey(container.querySelector('input')!, 'Enter');
    expect(onCommit).toHaveBeenCalledWith('orig');
    expect(onCancel).not.toHaveBeenCalled();
    unmount();
  });

  it('cancels (no commit) on Escape', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const { container, unmount } = mountTree(
      <InlineRenameInput
        inputRef={makeRef()}
        defaultValue="orig"
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    fireKey(container.querySelector('input')!, 'Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    unmount();
  });

  it('exposes the inner <input> through inputRef', () => {
    const ref = makeRef();
    const { unmount } = mountTree(
      <InlineRenameInput
        inputRef={ref}
        defaultValue="x"
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    unmount();
  });
});
