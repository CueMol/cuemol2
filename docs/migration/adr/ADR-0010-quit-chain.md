# ADR-0010: Application quit — per-tab modified-scene confirm chain

- Status: superseded by [ADR-0016](ADR-0016-window-close-quit-funnel.md)
- Date: 2026-05-13
- Mapping rows: [`menu.cuemol2.file`](../mapping/menus.md#menucuemol2file) — Quit/Exit,
  [`menu.cuemol2-macos`](../mapping/menus.md#menucuemol2-macos) — Quit CueMol,
  [`other.cuemol2`](../mapping/other.md#othercuemol2)

> **Superseded by [ADR-0016](ADR-0016-window-close-quit-funnel.md).** This
> ADR hooked the confirm chain to `before-quit` and wrongly assumed the
> window-close button also fires `before-quit`. It does not — the close
> button fires `win.on('close')`. ADR-0016 moves the funnel to
> `win.on('close')`. Kept for history.

## Context

UXP's `Qm2Main.onCloseEvent` walks every open tab in id order on quit
and runs the modified-scene confirm dialog (Save / Don't Save / Cancel)
for each tab whose scene is modified. Cancel on any tab aborts the
quit.

Tritium has the same requirement. The complication is that Electron's
quit signal arrives in the main process (`before-quit`), but the tab
state and confirm dialog live in the renderer. We need a chain that
crosses the main↔renderer boundary cleanly and lets the renderer reject
the quit if the user cancels.

The macOS App menu's Quit item is `role: quit` (an OS-level item) — we
cannot intercept it at the menu callback level. We have to hook
`before-quit` instead.

## Decision

**Chain: `before-quit` → `IPC.APP_QUIT_REQUEST` → per-tab close walk →
`IPC.APP_QUIT_PROCEED`.**

1. **Main process — `before-quit` listener** (`main/index.ts`)
   `preventDefault()`s the event and pushes `IPC.APP_QUIT_REQUEST` to
   the renderer.
2. **Renderer — `useQuitHandler`** subscribes to `APP_QUIT_REQUEST`
   and walks every tab via the existing `handleCloseTab` function (which
   uses `ConfirmCloseTabDialog` + `getSceneCloseInfo` for modified-scene
   gating — same flow as a manual Close Tab).
3. **On success** (every tab confirmed/closed) the renderer invokes
   `IPC.APP_QUIT_PROCEED`, and main re-issues `app.quit()` — this time
   the `before-quit` listener does not preventDefault because the chain
   marker says we initiated the re-quit.
4. **On cancel** (any tab dialog cancelled) the chain aborts; nothing
   is pushed back to main; the app stays open.

**`ConfirmCloseTabDialog` Save button** is wired to `CmdId.FileSave`
(consistent with the Close Tab path — see [Save Scene parity](ADR-0012-save-scene-parity.md)).

**macOS App menu Quit** still uses `role: quit`; the chain is driven by
`before-quit`, not the menu item directly.

**Non-macOS File > Quit/Exit** also uses `role: quit` so the same
chain runs.

## Consequences

- **One chain handles both the menu Quit and the window-close X
  button** — both fire `before-quit`.
- **The chain is symmetric with manual Close Tab** — no duplicate
  modified-scene logic; both paths use `handleCloseTab`.
- **OS-level Quit cannot be intercepted at the menu callback** — the
  `before-quit` hook is the only correct place. Anyone wiring a future
  menu item that should run on quit must hook `before-quit` too, not
  the `role: quit` item.
- **Per-tab walk in id order** matches UXP. If we ever need a different
  order (e.g. focused tab last) it would change the chain semantics —
  call this out in the new ADR.

## Notes

### Implementation pointers

- `tritium/react-gui/src/main/index.ts` — `before-quit` listener +
  re-quit marker
- `tritium/react-gui/src/renderer/hooks/useQuitHandler.ts` — chain
  driver, per-tab walk
- `tritium/react-gui/src/renderer/hooks/useTabManager.ts` —
  `handleCloseTab` (shared with manual close)
- `tritium/react-gui/src/renderer/components/dialogs/ConfirmCloseTabDialog.tsx`
  — Save / Don't Save / Cancel UI
- `tritium/react-gui/src/shared/ipcChannels.ts` — `APP_QUIT_REQUEST`,
  `APP_QUIT_PROCEED`

### UXP parity

- `uxp_gui/cuemol2/base/content/cuemol2_main.js` — `Qm2Main.onCloseEvent`,
  `closeTabImpl`

### Related ADRs

- [ADR-0012](ADR-0012-save-scene-parity.md) — `ConfirmCloseTabDialog`'s
  Save button uses the Save Scene path described there
