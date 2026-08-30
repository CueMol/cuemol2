/**
 * @file h3-kit/list/useListKeyNav.test.ts
 * @description The list keyboard contract every selectable surface shares.
 *
 * Pinned here rather than per consumer: the point of the hook is that the
 * scene tree and the paint deck cannot drift apart.
 */

import { describe, it, expect, vi } from 'vitest';
import { useListKeyNav, type ListKeyNavOptions } from './useListKeyNav';
import { makeRenderHook } from '@renderer/__test__/helpers/testHarness';

const ITEMS = ['a', 'b', 'c', 'd'];

interface KeyOpts {
    shiftKey?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
}

function key(k: string, o: KeyOpts = {}) {
    return {
        key: k,
        shiftKey: o.shiftKey ?? false,
        metaKey: o.metaKey ?? false,
        ctrlKey: o.ctrlKey ?? false,
        altKey: o.altKey ?? false,
        preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

function setup(over: Partial<ListKeyNavOptions> = {}) {
    const onSelect = vi.fn();
    const onSelectRange = vi.fn();
    const onScrollTo = vi.fn();
    const h = makeRenderHook(() =>
        useListKeyNav({
            items: ITEMS, activeId: 'b', onSelect, onSelectRange, onScrollTo, ...over,
        }),
    );
    return { h, onSelect, onSelectRange, onScrollTo };
}

describe('useListKeyNav', () => {
    it('moves the selection one row per arrow', () => {
        const { h, onSelect, onScrollTo } = setup();
        const down = key('ArrowDown');
        expect(h.result(down)).toBe(true);
        expect(down.preventDefault).toHaveBeenCalled();
        expect(onSelect).toHaveBeenCalledWith('c');
        expect(onScrollTo).toHaveBeenCalledWith('c');

        // Back up from where the previous move landed. (The caller's
        // `activeId` is a fixed 'b' here because onSelect is a spy; the hook
        // carries the cursor itself so a repeated press still walks.)
        const up = key('ArrowUp');
        h.result(up);
        expect(onSelect).toHaveBeenLastCalledWith('b');
        h.unmount();
    });

    it('stops at the ends instead of wrapping', () => {
        const first = setup({ activeId: 'a' });
        first.h.result(key('ArrowUp'));
        expect(first.onSelect).toHaveBeenCalledWith('a');
        first.h.unmount();

        const last = setup({ activeId: 'd' });
        last.h.result(key('ArrowDown'));
        expect(last.onSelect).toHaveBeenCalledWith('d');
        last.h.unmount();
    });

    it('jumps to the ends with Home / End', () => {
        const { h, onSelect } = setup();
        h.result(key('Home'));
        expect(onSelect).toHaveBeenLastCalledWith('a');
        h.result(key('End'));
        expect(onSelect).toHaveBeenLastCalledWith('d');
        h.unmount();
    });

    it('enters the list from an empty selection', () => {
        const down = setup({ activeId: null });
        down.h.result(key('ArrowDown'));
        expect(down.onSelect).toHaveBeenCalledWith('a');
        down.h.unmount();

        const up = setup({ activeId: null });
        up.h.result(key('ArrowUp'));
        expect(up.onSelect).toHaveBeenCalledWith('d');
        up.h.unmount();
    });

    it('extends with Shift, unioning with Shift+Cmd', () => {
        const { h, onSelect, onSelectRange } = setup();
        h.result(key('ArrowDown', { shiftKey: true }));
        expect(onSelectRange).toHaveBeenCalledWith('c', ITEMS, false);
        expect(onSelect).not.toHaveBeenCalled();

        // Shift+Cmd unions; the lead keeps walking, so this is the next row.
        h.result(key('ArrowDown', { shiftKey: true, metaKey: true }));
        expect(onSelectRange).toHaveBeenLastCalledWith('d', ITEMS, true);
        h.unmount();
    });

    it('grows the range one row per Shift+Arrow instead of stalling at two', () => {
        // The anchor stays put (the caller owns it) while a separate lead
        // walks, which is what lets a held Shift+Down keep extending. Keying
        // both off the anchor capped every range at two rows.
        const { h, onSelectRange } = setup({ activeId: 'a' });
        h.result(key('ArrowDown', { shiftKey: true }));
        h.result(key('ArrowDown', { shiftKey: true }));
        h.result(key('ArrowDown', { shiftKey: true }));
        expect(onSelectRange.mock.calls.map((c) => c[0])).toEqual(['b', 'c', 'd']);
        h.unmount();
    });

    it('reverses back over the range', () => {
        const { h, onSelectRange } = setup({ activeId: 'a' });
        h.result(key('End', { shiftKey: true }));      // lead -> d
        h.result(key('ArrowUp', { shiftKey: true }));  // lead -> c
        expect(onSelectRange.mock.calls.map((c) => c[0])).toEqual(['d', 'c']);
        h.unmount();
    });

    it('re-anchors the lead when the caller moves the selection', () => {
        const onSelect = vi.fn();
        const onSelectRange = vi.fn();
        let activeId = 'a';
        const h = makeRenderHook(() =>
            useListKeyNav({ items: ITEMS, activeId, onSelect, onSelectRange }),
        );
        h.result(key('ArrowDown', { shiftKey: true }));   // lead -> b
        // A click elsewhere: the next Shift range must start from there, not
        // from the stale lead.
        activeId = 'd';
        h.rerender();
        h.result(key('ArrowUp', { shiftKey: true }));
        expect(onSelectRange.mock.calls.map((c) => c[0])).toEqual(['b', 'c']);
        h.unmount();
    });

    it('a plain move carries the lead with it', () => {
        const { h, onSelect, onSelectRange } = setup({ activeId: 'a' });
        h.result(key('ArrowDown'));                       // select b, lead -> b
        h.result(key('ArrowDown', { shiftKey: true }));   // extend from b
        expect(onSelect).toHaveBeenCalledWith('b');
        expect(onSelectRange.mock.calls.map((c) => c[0])).toEqual(['c']);
        h.unmount();
    });

    it('leaves system gestures alone (plain Cmd+arrow, Alt+arrow)', () => {
        const { h, onSelect, onSelectRange } = setup();
        expect(h.result(key('ArrowDown', { metaKey: true }))).toBe(false);
        expect(h.result(key('ArrowDown', { altKey: true }))).toBe(false);
        expect(onSelect).not.toHaveBeenCalled();
        expect(onSelectRange).not.toHaveBeenCalled();
        h.unmount();
    });

    it('passes through keys it does not own, so callers keep theirs', () => {
        const { h } = setup();
        for (const k of ['F2', 'Delete', 'Backspace', 'a', 'Enter']) {
            expect(h.result(key(k))).toBe(false);
        }
        h.unmount();
    });

    it('does nothing while disabled or with an empty list', () => {
        const off = setup({ enabled: false });
        expect(off.h.result(key('ArrowDown'))).toBe(false);
        expect(off.onSelect).not.toHaveBeenCalled();
        off.h.unmount();

        const empty = setup({ items: [] });
        expect(empty.h.result(key('ArrowDown'))).toBe(false);
        empty.h.unmount();
    });

    it('collapses / expands only when the caller opted in', () => {
        const plain = setup();
        expect(plain.h.result(key('ArrowLeft'))).toBe(false);
        plain.h.unmount();

        const onCollapse = vi.fn();
        const onExpand = vi.fn();
        const tree = setup({ onCollapse, onExpand });
        expect(tree.h.result(key('ArrowLeft'))).toBe(true);
        expect(onCollapse).toHaveBeenCalledWith('b');
        expect(tree.h.result(key('ArrowRight'))).toBe(true);
        expect(onExpand).toHaveBeenCalledWith('b');
        tree.h.unmount();
    });
});
