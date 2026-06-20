/**
 * @file __test__/tabCloseMolTabSync.test.tsx
 * @description Integration contract for the molview-tab teardown: closing a
 * molview tab must clear the matching `molTabEntries` row (so the derived
 * active scene becomes undefined and the Explorer / Inspector empty out),
 * including on the slow "confirm -> save -> close" path.
 *
 * Regression guard: the close side effects (onMolViewClose -> removeMolTab,
 * setActiveTab) used to run inside the `setTabs` updater, which made the
 * parallel `molTabEntries` removal nondeterministic after an awaited save and
 * left the app pointed at the closed scene.
 */

import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushPromises } from './helpers/testHarness';
import {
    MolTabProvider,
    useMolTabDispatch,
    useMolTabState,
} from '../hooks/useMolTab';
import { useTabManager } from '../hooks/useTabManager';

void React;

interface Harness {
    activeSceneId: () => number | undefined;
    molTabCount: () => number;
    addMolView: (title: string, viewId: number, sceneId: number) => void;
    closeActiveMolView: () => Promise<void>;
}

/**
 * Mount a minimal App-like wiring: the tab manager's `onMolViewClose` calls
 * `removeMolTab` exactly as App does, and the active scene is derived from
 * `molTabEntries` (App's `activeSceneId`). The `live` box is refreshed every
 * render so the returned harness reads the latest state, not a mount snapshot.
 */
function mount(confirmCloseTab: () => Promise<boolean>): { h: Harness; unmount: () => void } {
    const live: {
        molTabEntries: { view_id: number; scene_uid: number; active: boolean }[];
        tabs: ReturnType<typeof useTabManager>['tabs'];
        addMolTab: (title: string, viewId: number, sceneId: number) => void;
        addMolViewTab: (title: string, viewId: number) => void;
        handleCloseTab: (id: string) => Promise<boolean>;
    } = {
        molTabEntries: [],
        tabs: [],
        addMolTab: () => {},
        addMolViewTab: () => {},
        handleCloseTab: async () => false,
    };
    let firstViewId: number | undefined;

    const Probe: React.FC = () => {
        const { addMolTab, removeMolTab } = useMolTabDispatch();
        const { molTabEntries } = useMolTabState();
        const tm = useTabManager({
            onMolViewClose: (viewId) => removeMolTab(viewId),
            confirmCloseTab,
        });
        live.molTabEntries = molTabEntries;
        live.tabs = tm.tabs;
        live.addMolTab = addMolTab;
        live.addMolViewTab = tm.addMolViewTab;
        live.handleCloseTab = tm.handleCloseTab;
        return null;
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    let root!: Root;
    act(() => {
        root = createRoot(container);
        root.render(
            React.createElement(MolTabProvider, null, React.createElement(Probe)),
        );
    });

    const h: Harness = {
        activeSceneId: () => live.molTabEntries.find((t) => t.active)?.scene_uid,
        molTabCount: () => live.molTabEntries.length,
        addMolView: (title, viewId, sceneId) => {
            live.addMolTab(title, viewId, sceneId);
            live.addMolViewTab(title, viewId);
            firstViewId = viewId;
        },
        closeActiveMolView: async () => {
            const tab = live.tabs.find((t) => t.type === 'molview' && t.viewId === firstViewId);
            if (tab) await live.handleCloseTab(tab.id);
        },
    };

    return {
        h,
        unmount: () => {
            act(() => root.unmount());
            container.remove();
        },
    };
}

describe('molview tab close -> molTabEntries teardown', () => {
    it('clears the active scene when the only tab is closed via async (save) confirm', async () => {
        // Catch the React "Cannot update a component while rendering a different
        // component" warning -- the symptom of running removeMolTab inside the
        // setTabs updater, which was the root cause of the stale-scene bug.
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { h, unmount } = mount(() => Promise.resolve(true));

        act(() => h.addMolView('Scene:0', 7, 1));
        expect(h.activeSceneId()).toBe(1);
        expect(h.molTabCount()).toBe(1);

        await act(async () => {
            await h.closeActiveMolView();
            await flushPromises();
        });

        // The molview entry is gone, so the derived active scene is undefined
        // (Explorer / Inspector empty out instead of editing the closed scene).
        expect(h.molTabCount()).toBe(0);
        expect(h.activeSceneId()).toBeUndefined();

        // No cross-component setState-during-render warning: the teardown side
        // effects run at the top level, not inside the setTabs updater.
        const badWarn = errSpy.mock.calls.find((c) =>
            String(c[0]).includes('Cannot update a component'),
        );
        expect(badWarn).toBeUndefined();
        errSpy.mockRestore();
        unmount();
    });

    it('keeps the tab open when the confirm is declined', async () => {
        const { h, unmount } = mount(() => Promise.resolve(false));

        act(() => h.addMolView('Scene:0', 7, 1));
        expect(h.activeSceneId()).toBe(1);

        await act(async () => {
            await h.closeActiveMolView();
            await flushPromises();
        });

        expect(h.molTabCount()).toBe(1);
        expect(h.activeSceneId()).toBe(1);
        unmount();
    });
});
