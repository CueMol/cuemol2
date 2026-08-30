/**
 * @file main/handlers/windowActions.test.ts
 * @description Which menu roles the main process answers, and on which window.
 *
 * The switch behind `MENU_INVOKE_ROLE` used to answer ten roles. Only two are
 * declared as `role:` anywhere in the menu template -- the edit roles resolve
 * by focus, the macOS app-menu roles are native, and reload / zoom /
 * fullscreen / about / close were never attached to an item. The zoom cases
 * were the convincing ones: they drove an app-wide `setZoomLevel` that the
 * Rendering window still adopts when it opens, so the feature looked complete
 * from both ends while nothing could trigger it.
 *
 * It also acted on the main window unconditionally, so DevTools requested from
 * the Rendering window opened the wrong inspector.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
    app: { quit: vi.fn(), exit: vi.fn() },
    BrowserWindow: { fromWebContents: vi.fn(() => null) },
    ipcMain: { handle: vi.fn() },
}));

vi.mock('../ipc/handleInvoke', () => ({
    handleInvoke: (channel: string, fn: (...args: unknown[]) => unknown) => {
        handlers.set(channel, fn);
    },
}));

vi.mock('../windows/reveal', () => ({ revealWindow: vi.fn() }));

vi.mock('../quitState', () => ({
    setAppQuitting: vi.fn(),
    setCloseConfirmed: vi.fn(),
    setCloseInFlight: vi.fn(),
    setForceQuit: vi.fn(),
}));

import { app, BrowserWindow } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { revealWindow } from '../windows/reveal';
import { registerWindowHandlers } from './windowActions';

/** A window stub with just the surface these handlers touch. */
function makeWindow() {
    return {
        isDestroyed: () => false,
        webContents: { toggleDevTools: vi.fn() },
        setTitle: vi.fn(),
        close: vi.fn(),
        isMinimized: () => false,
        show: vi.fn(),
        focus: vi.fn(),
    };
}

describe('MENU_INVOKE_ROLE', () => {
    let mainWindow: ReturnType<typeof makeWindow>;
    let invokeRole: (event: unknown, role: string) => unknown;

    beforeEach(() => {
        handlers.clear();
        vi.clearAllMocks();
        mainWindow = makeWindow();
        registerWindowHandlers(mainWindow as never);
        invokeRole = handlers.get(IPC.MENU_INVOKE_ROLE) as typeof invokeRole;
    });

    it('toggles DevTools on the window that asked, not the main one', () => {
        const sender = makeWindow();
        vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(sender as never);

        invokeRole({ sender: {} }, 'toggleDevTools');

        expect(sender.webContents.toggleDevTools).toHaveBeenCalledTimes(1);
        expect(mainWindow.webContents.toggleDevTools).not.toHaveBeenCalled();
    });

    it('falls back to the main window when the sender has none', () => {
        invokeRole({ sender: {} }, 'toggleDevTools');
        expect(mainWindow.webContents.toggleDevTools).toHaveBeenCalledTimes(1);
    });

    it('quits on the quit role', () => {
        invokeRole({ sender: {} }, 'quit');
        expect(app.quit).toHaveBeenCalledTimes(1);
    });

    it.each(['reload', 'forceReload', 'resetZoom', 'zoomIn', 'zoomOut',
             'togglefullscreen', 'about', 'close'])(
        'ignores %s, which no menu item carries',
        (role) => {
            expect(() => invokeRole({ sender: {} }, role)).not.toThrow();
            expect(app.quit).not.toHaveBeenCalled();
            expect(mainWindow.close).not.toHaveBeenCalled();
            expect(mainWindow.webContents.toggleDevTools).not.toHaveBeenCalled();
        },
    );

    it('does nothing for a destroyed window', () => {
        const dead = { ...makeWindow(), isDestroyed: () => true };
        vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(dead as never);

        invokeRole({ sender: {} }, 'quit');

        expect(app.quit).not.toHaveBeenCalled();
    });
});

describe('WINDOW_REVEAL', () => {
    it('reveals the window the signal came from', () => {
        handlers.clear();
        vi.clearAllMocks();
        registerWindowHandlers(makeWindow() as never);
        const sender = makeWindow();
        vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(sender as never);

        handlers.get(IPC.WINDOW_REVEAL)!({ sender: {} });

        expect(revealWindow).toHaveBeenCalledWith(sender);
    });

    it('does nothing for a sender with no window', () => {
        handlers.clear();
        vi.clearAllMocks();
        registerWindowHandlers(makeWindow() as never);

        handlers.get(IPC.WINDOW_REVEAL)!({ sender: {} });

        expect(revealWindow).not.toHaveBeenCalled();
    });
});
