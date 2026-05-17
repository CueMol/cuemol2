# ADR-0016: Window close and app quit — single win.on('close') confirm funnel

- Status: accepted (supersedes [ADR-0010](ADR-0010-quit-chain.md))
- Date: 2026-05-17
- Mapping rows: [`menu.cuemol2`](../mapping/menus.md#menucuemol2) — Quit/Exit,
  [`menu.cuemol2-macos`](../mapping/menus.md#menucuemol2-macos) — Quit CueMol,
  [`other.cuemol2`](../mapping/other.md#othercuemol2)

## Context

[ADR-0010](ADR-0010-quit-chain.md) wired the modified-scene confirm chain
to Electron's `before-quit` event and asserted in its Consequences that
"one chain handles both the menu Quit and the window-close X button — both
fire `before-quit`". **That assertion is wrong.**

Electron only emits `before-quit` when `app.quit()` is called (Cmd+Q /
`role: quit`). The macOS traffic-light close button and the Windows/Linux
X button do **not** call `app.quit()` — they fire `win.on('close')`. The
result observed on `dev_0516`:

- macOS traffic-light close: the window closed with no confirm dialog,
  then `window-all-closed` did nothing on macOS, leaving a window-less
  zombie process.
- Windows/Linux X button: `window-all-closed` → `app.quit()` fired
  `before-quit`, but by then the window was already destroyed, so the
  renderer-walk could not run — the app quit with no confirm either.

So `before-quit` is the wrong single hook. The confirm walk needs to run
while the window still exists, on the event the close button actually
fires.

## Decision

**Make `win.on('close')` the single confirmation funnel.** The
traffic-light/X button and Cmd+Q (which calls `win.close()` on every
window) both reach it. Quit = close every window.

1. **`main/windowManager.ts` — `handleWindowClose(win, event)`**: on the
   first `close` for a window, `preventDefault()` and push
   `IPC.WINDOW_CLOSE_REQUEST` to that window's renderer. A per-window
   `inFlight` flag suppresses duplicate requests (button mashing).
2. **`renderer/hooks/useWindowCloseHandler.ts`** subscribes to
   `WINDOW_CLOSE_REQUEST` and walks every tab via `handleCloseTab` (the
   same `ConfirmCloseTabDialog` + `getSceneCloseInfo` flow as a manual
   Close Tab). It **always** replies `IPC.WINDOW_CLOSE_PROCEED` with
   `{ proceed: boolean }` — `true` when every tab is confirmed, `false`
   when the user cancels.
3. **`main/ipcHandlers.ts`** on `proceed: true` marks the window
   `closeConfirmed` and re-issues `win.close()` (the funnel lets the
   second `close` through); on `proceed: false` clears `inFlight` and
   resets `appQuitting`.
4. **`main/index.ts` — `before-quit`** no longer confirms anything. It
   sets the app-level `appQuitting` flag and calls `win.close()` on every
   window, so each window runs its own funnel. **`window-all-closed`**
   calls `app.quit()` on every OS, so closing the window quits the app
   and leaves no zombie.

State lives in `main/quitState.ts`: a `WeakMap<BrowserWindow, …>` of
per-window `confirmed` / `inFlight`, plus a single app-level `appQuitting`
boolean.

## Consequences

- **Close button == quit app** on every OS, with the modified-scene
  confirm walk; cancel keeps the window open. No more window-less zombie.
- **The chain is still symmetric with manual Close Tab** — both use
  `handleCloseTab`; no duplicate modified-scene logic.
- **Replying on cancel is mandatory.** The renderer must invoke
  `WINDOW_CLOSE_PROCEED` even on cancel; otherwise main never clears
  `inFlight` and the window can never be closed again.
- **`window-all-closed` quitting on macOS is a deliberate
  single-window choice** — it diverges from the macOS norm of keeping the
  app alive in the Dock. See the multi-window note below.
- **Multi-window-ready.** The funnel is per-window: each window owns its
  `confirmed`/`inFlight` state and its renderer walks only its own tabs.
  `before-quit` already iterates every window. The single OS-specific
  branch to flip when multi-window lands is `window-all-closed`: on macOS
  it should `return` early (keep the app alive) when the last window is
  closed without an explicit quit —
  `if (process.platform === 'darwin' && !isAppQuitting()) return`. This
  is recorded as a `FUTURE` comment in `main/index.ts`.

## Notes

### Implementation pointers

- `tritium/react-gui/src/main/quitState.ts` — per-window
  `confirmed`/`inFlight` WeakMap + app-level `appQuitting`
- `tritium/react-gui/src/main/windowManager.ts` — `handleWindowClose`
  funnel attached as a second `close` listener (separate from the
  bounds-saving one)
- `tritium/react-gui/src/main/index.ts` — `before-quit` (close all
  windows) + `window-all-closed` (`app.quit()`)
- `tritium/react-gui/src/main/ipcHandlers.ts` — `WINDOW_CLOSE_PROCEED`
  handler
- `tritium/react-gui/src/renderer/hooks/useWindowCloseHandler.ts` —
  per-tab walk, always replies proceed/cancel
- `tritium/react-gui/src/shared/ipcChannels.ts` /
  `ipcContract.ts` — `WINDOW_CLOSE_REQUEST`, `WINDOW_CLOSE_PROCEED`
  (`{ proceed: boolean }`)

### Tests

- `renderer/__test__/windowCloseFlow.test.tsx` — per-tab walk + proceed/
  cancel reply contract
- `renderer/__test__/quitState.test.ts` — per-window state isolation,
  `appQuitting` toggle

### UXP parity

- `uxp_gui/cuemol2/base/content/cuemol2.js` — `Qm2Main.onCloseEvent`,
  `closeTabImpl`

### Related ADRs

- [ADR-0010](ADR-0010-quit-chain.md) — superseded by this ADR
- [ADR-0012](ADR-0012-save-scene-parity.md) — `ConfirmCloseTabDialog`'s
  Save button uses the Save Scene path described there
