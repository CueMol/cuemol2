# ADR-0035: Rendering window — modeless child BrowserWindow hosting all render UI

- Status: accepted (host E2E pending; competing alternative to PR #416 / ADR-0034)
- Date: 2026-07-05
- Mapping rows: [`dialog.tool.render-pov`](../mapping/tool_dlgs.md)
- Supersedes: the three-surface split of
  [ADR-0017](ADR-0017-povray-rendering-ui.md) (Inspector `renderSettings`
  target, BottomPanel "Render" tab, ContentArea Render Result tab). The
  worker pipeline of ADR-0017 is unchanged.

## Context

ADR-0017 spread the POV-Ray render UI across three main-window surfaces.
The result tab made the rendered image and the WebGL molview mutually
exclusive: the iterate loop (rotate -> Start -> compare -> adjust) required
a tab switch per cycle. The UXP `render-pov-dlg` was a modeless window with
none of these problems, and its all-in-one-window shape also keeps the main
window free of render chrome.

Two competing redesigns exist:

- **PR #416 (ADR-0034)**: docked preview pane right of ContentArea, keeping
  settings in the Inspector and Start/Stop in the BottomPanel.
- **This ADR**: a modeless child window consolidating all three surfaces —
  the closest UXP-parity shape. Whichever merges first supersedes the other.

## Decision

Add a second `BrowserWindow` ("Rendering", `render.html`) as a modeless
child of the main window (`parent: mainWindow`, so it always stays above
it). It hosts, in Allotment splits: the result image viewer
(`RenderResultPane`/`RenderImageViewer`), the render execution panel
(`RenderPanel`: Start/Stop, size preset, progress, log) below it, and the
`RenderSettingsEditor` in a right pane. The main window loses the
BottomPanel "render" tab, the inspector `renderSettings` target, and the
`renderResult` tab type.

Key constraints and choices:

- **Worker locality.** The CueMol native addon lives only in the main
  window's renderer (a second window is a separate OS process — a second
  addon instance would have fully independent libcuemol2 state). The render
  window therefore mounts no CueMolProvider; every render action is relayed
  over IPC through the main process:
  `RENDER_WINDOW_COMMAND` (invoke, render window -> main) ->
  `RENDER_WINDOW_EXEC` (push, main -> main window) and
  `RENDER_WINDOW_STATE` (invoke, main window -> main) ->
  `RENDER_WINDOW_STATE_PUSH` (push, main -> render window).
- **State split.** `useRenderSettings` (pure local state) lives in the
  render window; a Start sends the frozen snapshot. The job lifecycle
  (`useRenderJob`) and the single latest `RenderResult` live in the main
  window's `useRenderWindowBridge` — a job keeps running when the window
  closes, and reopening re-syncs via a `sync` command (subscribe-before-sync
  ordering; state pushes are dropped silently while the window is closed).
- **Image transfer.** The multi-MB result data URL is pushed once per
  completed render in its own `result` update, never on progress ticks.
- **"Current view" preset.** The canvas exists only in the main window's
  DOM, so `RENDER_VIEW_SIZE_GET` does a correlation-id round trip
  (render window -> main -> main window -> main -> render window, 2 s
  timeout fallback).
- **Binaries.** Attached main-window-side at start time from
  `useRenderConfig()` (Settings-pane edits are always fresh; the render
  window never sees paths).
- **Window lifecycle.** Real close + recreate on demand (no hide-on-close);
  bounds persisted under a new `renderWindowBounds` store key. No app menu
  for this window (`createMenu` would rebind the menu's window ref); no
  close-confirm funnel; a renderer crash destroys only this window (the
  main window's handler still exits the app).
- **Triggers.** Toolbar "Render" button and Rendering > "POV-Ray
  rendering..." (`MENU_POV_RENDER`, previously unimplemented) both dispatch
  the renamed `CmdId.UiRenderWindow` -> `RENDER_WINDOW_OPEN` (open-or-focus).
- **StatusBar.** The main window keeps its render-progress line, fed from
  the bridge's job, since a job can run with the window closed.

## Consequences

- The iterate loop needs no tab switches; on multi-monitor setups the
  render UI can sit on a second display (UXP parity).
- Settings edits are window-local and reset when the window closes
  (matches the UXP dialog); persisting the snapshot is a possible follow-up.
- Result history is a single latest render; Save exports before it is
  overwritten.
- electron-vite renderer build becomes multi-page (`index.html` +
  `render.html` via `rollupOptions.input`); the full `app.css` is imported
  by both windows (dead CSS in the render window accepted for v1).
- `RenderPanel.onOpenSettings` / `RenderResultPane.onOpenSettings` became
  optional (hidden in the window, where settings are always visible).
- Closing the main window closes the child automatically (Electron
  parent-child), so quit semantics are unchanged.

## Notes

- Implementation pointers:
  - Main process: `main/windowManager.ts` (`createOrFocusRenderWindow`,
    parameterized `trackWindowState`), `main/renderWindowIpc.ts` (relay +
    view-size correlation), `main/stateStore.ts` (`renderWindowBounds`).
  - IPC contract: `shared/ipcChannels.ts` (`render-window:*`),
    `shared/ipcTypes.ts` (wire types `RenderWindowCommand` /
    `RenderWindowStateUpdate` / `ViewSizePx`), `shared/ipcContract.ts`.
  - Renderer: `render.html` / `render.tsx` (ErrorBoundary + ThemeProvider
    only; no `installGlobalCrashHandlers`),
    `components/renderwindow/RenderWindowApp.tsx`,
    `hooks/useRenderWindowBridge.ts` (main window),
    `hooks/useRenderWindowClient.ts` (render window),
    `styles/_render-window.css`.
  - Tests: `__test__/useRenderWindowBridge.test.ts`,
    `__test__/useRenderWindowClient.test.ts`.
- The real two-window relay, `parent` z-order, and the multi-entry build
  cannot be unit-tested (jsdom, single process) — covered by the manual
  checklist in the PR.
- UXP parity reference: `uxp_gui/cuemol2/base/content/tools/render-pov-dlg.{xul,js}`.
