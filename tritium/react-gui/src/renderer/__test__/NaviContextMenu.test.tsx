import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { NaviContextMenu, type NaviContextMenuState } from '../components/NaviContextMenu';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeHit(overrides: Record<string, any> = {}) {
    return {
        objtype: 'MolCoord',
        obj_id: 1, obj_name: 'mol1',
        rend_id: 10, rend_name: 'ribbon1', rendtype: '*ribbon',
        atom_id: 42, sel: 'aid 42', message: 'ALA 10 CA',
        x: 1.0, y: 2.0, z: 3.0,
        occ: 1.0, bfac: 25.5,
        ...overrides,
    };
}

function render(state: NaviContextMenuState, onClose = vi.fn()): { container: HTMLElement; unmount: () => void } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root!: Root;
    act(() => {
        root = createRoot(container);
        root.render(React.createElement(NaviContextMenu, { state, onClose }));
    });
    return {
        container,
        unmount() {
            act(() => root.unmount());
            document.body.removeChild(container);
        },
    };
}

describe('NaviContextMenu', () => {
    it('renders nothing when closed', () => {
        const { container, unmount } = render({ open: false, x: 0, y: 0, hitres: null });
        expect(container.querySelector('.bp5-menu')).toBeNull();
        unmount();
    });

    it('renders menu when open with a hit', () => {
        const { container, unmount } = render({ open: true, x: 50, y: 80, hitres: makeHit() });
        expect(container.querySelector('.bp5-menu')).toBeTruthy();
        unmount();
    });

    it('displays atom header label', () => {
        const { container, unmount } = render({ open: true, x: 0, y: 0, hitres: makeHit() });
        const text = container.textContent ?? '';
        expect(text).toContain('mol1: ALA 10 CA');
        unmount();
    });

    it('displays renderer label', () => {
        const { container, unmount } = render({ open: true, x: 0, y: 0, hitres: makeHit() });
        const text = container.textContent ?? '';
        expect(text).toContain('ribbon1 (*ribbon)');
        unmount();
    });

    it('does not show symm items for non-symm renderer', () => {
        const { container, unmount } = render({ open: true, x: 0, y: 0, hitres: makeHit({ rendtype: '*ribbon' }) });
        expect(container.textContent ?? '').not.toContain('SYMM');
        unmount();
    });

    it('shows symm items for symm renderer', () => {
        const { container, unmount } = render({
            open: true, x: 0, y: 0,
            hitres: makeHit({ rendtype: '*symm', symm_name: '2_555' }),
        });
        const text = container.textContent ?? '';
        expect(text).toContain('symop: 2_555');
        expect(text).toContain('SYMM');
        unmount();
    });

    it('positions menu at x+2, y+2', () => {
        const { container, unmount } = render({ open: true, x: 100, y: 200, hitres: makeHit() });
        const menuWrapper = container.firstElementChild as HTMLElement;
        expect(menuWrapper.style.left).toBe('102px');
        expect(menuWrapper.style.top).toBe('202px');
        unmount();
    });

    it('calls onClose when outside click occurs', () => {
        const onClose = vi.fn();
        const { unmount } = render({ open: true, x: 0, y: 0, hitres: makeHit() }, onClose);
        act(() => {
            document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        expect(onClose).toHaveBeenCalled();
        unmount();
    });
});
