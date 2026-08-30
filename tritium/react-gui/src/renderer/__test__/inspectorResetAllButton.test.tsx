/**
 * Pin the confirm-gated contract of InspectorResetAllButton (UXP parity:
 * `resetAllToDefault` asks "Reset all to default?" before the bulk reset):
 *   - clicking the button opens the Alert and does NOT call onResetAll yet;
 *   - Alert confirm calls onResetAll exactly once and closes;
 *   - Alert cancel closes without calling onResetAll;
 *   - the button is disabled when canResetAll is false.
 * One test covers both call sites (InspectorPanel / AnimElementInspector),
 * which render this same component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { InspectorResetAllButton } from '@renderer/features/inspector/InspectorResetAllButton';

void React;

vi.mock('@renderer/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light' }),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const onResetAll = vi.fn();

function mount(canResetAll = true): void {
    act(() => {
        root.render(
            <InspectorResetAllButton canResetAll={canResetAll} onResetAll={onResetAll} />,
        );
    });
}

function resetButton(): HTMLButtonElement {
    const btn = container.querySelector<HTMLButtonElement>('.inspector-reset-all');
    if (!btn) throw new Error('reset-all button not found');
    return btn;
}

/** The Alert renders in a Blueprint portal attached to document.body. */
function alertButton(label: string): HTMLButtonElement | null {
    const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.bp5-alert .bp5-button'),
    );
    return buttons.find((b) => b.textContent?.trim() === label) ?? null;
}

beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { root = createRoot(container); });
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe('InspectorResetAllButton', () => {
    it('opens the confirm Alert without resetting yet', () => {
        mount();
        act(() => { resetButton().click(); });
        expect(alertButton('Reset')).not.toBeNull();
        expect(onResetAll).not.toHaveBeenCalled();
    });

    it('runs the reset exactly once on confirm', () => {
        mount();
        act(() => { resetButton().click(); });
        act(() => { alertButton('Reset')!.click(); });
        expect(onResetAll).toHaveBeenCalledTimes(1);
    });

    it('does not reset on cancel', () => {
        mount();
        act(() => { resetButton().click(); });
        act(() => { alertButton('Cancel')!.click(); });
        expect(onResetAll).not.toHaveBeenCalled();
    });

    it('is disabled when nothing is modified', () => {
        mount(false);
        expect(resetButton().disabled).toBe(true);
    });
});
