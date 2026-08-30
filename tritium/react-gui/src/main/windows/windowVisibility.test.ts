/**
 * @file main/windows/windowVisibility.test.ts
 * @description Neither window goes on screen before its renderer says so.
 *
 * Both windows had a `ready-to-show` handler and `show` left at its default,
 * so each appeared the moment it was constructed -- empty -- and was then
 * furnished in front of the user. Holding them back on `ready-to-show` alone
 * would not have helped: that event fires on the document's first paint,
 * which for these pages is an empty root element. The reveal is the
 * renderer's call (reveal.ts); this pins that creation defers to it.
 *
 * The main window had a second way of revealing itself: `maximize()` shows a
 * window that is being held back, so restoring the maximized state has to
 * wait for the reveal too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { FakeWindow, state } = vi.hoisted(() => {
    type Listener = (...args: unknown[]) => void;
    const state = { constructed: null as InstanceType<typeof FakeWindow> | null, saved: null as unknown };
    class FakeWindow {
        listeners = new Map<string, Listener[]>();
        maximize = vi.fn();
        show = vi.fn();
        focus = vi.fn();
        setMenuBarVisibility = vi.fn();
        loadURL = vi.fn();
        loadFile = vi.fn();
        isDestroyed = vi.fn(() => false);
        isMaximized = vi.fn(() => false);
        getBounds = vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 }));
        webContents = {
            on: vi.fn(),
            send: vi.fn(),
            openDevTools: vi.fn(),
            getZoomLevel: vi.fn(() => 0),
            setZoomLevel: vi.fn(),
        };
        on = vi.fn((event: string, cb: Listener) => {
            this.listeners.set(event, [...(this.listeners.get(event) ?? []), cb]);
        });
        once = this.on;
        constructor(public options: Record<string, unknown>) {
            state.constructed = this;
        }
        fire(event: string): void {
            for (const cb of this.listeners.get(event) ?? []) cb();
        }
    }
    return { FakeWindow, state };
});

vi.mock('electron', () => ({
    app: { isPackaged: false, name: 'CueMol3', exit: vi.fn(), quit: vi.fn() },
    BrowserWindow: FakeWindow,
    screen: {
        getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 3000, height: 2000 } }],
        getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 3000, height: 2000 } }),
    },
}));
vi.mock('../stateStore', () => ({
    loadWindowBounds: () => state.saved,
    saveWindowBounds: vi.fn(),
    loadRenderWindowBounds: () => null,
    saveRenderWindowBounds: vi.fn(),
}));
vi.mock('../ipcHandlers', () => ({ registerIpcHandlers: vi.fn() }));
vi.mock('../renderWindowIpc', () => ({ registerRenderWindowIpc: vi.fn() }));
vi.mock('../menu', () => ({ createMenu: vi.fn(), resetMenuBlockReason: vi.fn() }));
vi.mock('../textContextMenu', () => ({ registerTextContextMenu: vi.fn() }));
vi.mock('../cuemolClipboard', () => ({ registerCuemolClipboardIpc: vi.fn() }));
vi.mock('../helpers/appIcon', () => ({ getDevIconPath: () => undefined }));

import { chromeWindowOptions } from './windowChrome';
import { createWindow } from './mainWindow';
import { createOrFocusRenderWindow } from './renderWindow';
import { revealWindow } from './reveal';

const constructed = () => state.constructed!;

describe('window visibility', () => {
    beforeEach(() => {
        state.constructed = null;
        state.saved = null;
        vi.clearAllMocks();
    });
    // createWindow() is a no-op while a main window exists; closing the one
    // a test made lets the next test make its own.
    afterEach(() => {
        state.constructed?.fire('closed');
    });

    it('dresses every window to start hidden', () => {
        expect(chromeWindowOptions().show).toBe(false);
        expect(chromeWindowOptions({ worker: true }).show).toBe(false);
    });

    it('shows the main window on the renderer\'s signal, not on ready-to-show', () => {
        createWindow();
        const win = constructed();
        expect(win.options['show']).toBe(false);

        win.fire('ready-to-show');
        expect(win.show).not.toHaveBeenCalled();

        revealWindow(win as never);
        expect(win.show).toHaveBeenCalledTimes(1);
        expect(win.focus).toHaveBeenCalledTimes(1);
    });

    it('restores the maximized state at reveal time, not at construction', () => {
        state.saved = { x: 0, y: 0, width: 1400, height: 900, isMaximized: true };
        createWindow();
        const win = constructed();
        expect(win.maximize).not.toHaveBeenCalled();

        revealWindow(win as never);
        expect(win.maximize).toHaveBeenCalledTimes(1);
        expect(win.show).toHaveBeenCalledTimes(1);
        // maximize() itself shows the window, so it must run before show()
        // or the window would appear un-maximized for a frame.
        expect(win.maximize.mock.invocationCallOrder[0]).toBeLessThan(
            win.show.mock.invocationCallOrder[0],
        );
    });

    it('shows the Rendering window on its renderer\'s signal', () => {
        const parent = new FakeWindow({});
        state.constructed = null;
        createOrFocusRenderWindow(parent as never);
        const win = constructed();
        expect(win.options['show']).toBe(false);

        win.fire('ready-to-show');
        expect(win.show).not.toHaveBeenCalled();

        revealWindow(win as never);
        expect(win.show).toHaveBeenCalledTimes(1);
    });
});
