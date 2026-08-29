# ADR-0035: Rendering window — modeless child BrowserWindow hosting all render UI

- Status: accepted (merged in PR #418; host E2E verified). The competing
  docked-pane alternative (PR #416 / ADR-0034) was closed unmerged.
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

Two redesigns were prototyped as competing PRs and evaluated side by side:

- **PR #416 (ADR-0034)**: docked preview pane right of ContentArea, keeping
  settings in the Inspector and Start/Stop in the BottomPanel.
- **This ADR (PR #418)**: a modeless child window consolidating all three
  surfaces — the closest UXP-parity shape.

The modeless-window approach was adopted (PR #418 merged); PR #416 was
closed unmerged and ADR-0034's number is retired (see the ADR index).

## Decision

Add a second `BrowserWindow` ("Rendering", `render.html`) as a modeless
child of the main window (`parent: mainWindow`, so it always stays above
it). It hosts, in Allotment splits: the result image viewer
(`RenderResultPane`/`RenderImageViewer`), the render execution panel
(`RenderPanel`: Start/Stop, Backend / Target, progress, log) below it, and
the settings pane (`RenderSettingsPane`) on the right. The main window loses
the BottomPanel "render" tab, the inspector `renderSettings` target, and the
`renderResult` tab type.

Key constraints and choices:

- **Settings live in one pane, run controls in the other.** The right pane
  splits into two tabs: "Image" (`RenderImageTab` — Size, Output and, in movie
  mode, the Movie section; opens first, since size is what a render is set up
  around) and "Render" (`RenderSettingsEditor` — the quality section plus the
  backend-driven groups). The bottom pane is then only the run bar and the
  log. The first layout put the image / movie settings in two resizable
  columns in the bottom pane, which split one concern across both panes, cost
  the log its space, and made the settings height depend on the sash
  position. The Backend dropdown sits in the run bar next to Target, since
  the pair answers "render what, with what" and is picked per run, not per
  setting; the Image tab hides output settings the active backend does not
  honor, exactly as the Render tab hides unsupported group props.
- **Quality axes** (umbreon). The Render tab opens with a Quality section:
  a Lighting dropdown (Raytrace only / Ambient Occlusion / Global
  Illumination) plus one dropdown per independent quality axis
  (Supersampling, the method's own AO / GI quality, Shadows). The values are
  ported from umbreon's `docs/quality_presets.md`; see
  [ADR-0042](ADR-0042-umbreon-quality-presets.md) for the axis model and the
  AO / AA wiring it required in libcuemol2.
- **Render history, on disk.** Completed renders accumulate (50 deep) and the
  result pane gets Back / Forward arrows. Stepping restores the entry's image
  AND its settings snapshot, so a parameter change can be compared against the
  previous attempt and reverted to it -- the earlier behaviour replaced the
  single latest result outright.

  The depth is affordable because the images never sit in memory. A finished
  render is already a PNG in the worker's work dir, so the worker reports its
  *path* (`imagePath`) instead of a data URL, the main window has the main
  process archive it by result id (`main/renderHistory.ts`, a temp directory
  wiped on quit and on the next start), and the render window holds metadata
  only, reading back just the entry it shows (`RENDER_HISTORY_READ`) -- the
  same shape as the movie frame slider. Nothing multi-MB crosses IPC any more,
  where a completed render used to push a base64 image through two hops.

  The metadata list lives in the main window's bridge, not the render window,
  so the history survives that window closing -- matching how long the
  archived files live -- and a re-sync re-pushes the whole list.
- **Clearing** is explicit as well as automatic: a trash button in the result
  toolbar (confirmed, since the images cannot be recovered without
  re-rendering) drops the metadata, the archived images and the temp work
  directories the jobs left behind. Those work directories are the reason it
  is worth a button: the worker keeps a still render's directory after the job
  so its `.pov` / `.inc` can be inspected, which used to leave one directory
  per render in the temp dir forever (71 of them, 23 MB, on the machine this
  was found). They are now registered as their image is archived and go with
  the history -- on quit as well as on demand. Only directories the worker
  reports and that sit under the temp dir are touched, so a movie's frames (in
  the user's own folder) and any mis-reported path are never deleted.

  Their names are random, so a run that dies before its cleanup would leave
  them unidentifiable: the registered paths are therefore also written to a
  `workdirs.json` beside the archived images, and the next start removes
  exactly what that lists. Sweeping the temp dir by name pattern instead would
  risk deleting a second instance's in-flight directory. That startup cleanup
  does not ask first -- what it reclaims is unreachable, since the history
  metadata died with the crashed run -- unlike the in-session Clear button,
  which confirms because it discards a history the user is looking at.
- **Trackpad zoom** in the result viewer. Panning was already there (the image
  sits in a scroll container, so a two-finger swipe scrolls it), but zoom was
  toolbar-only. A pinch reaches an element as a wheel event with a synthetic
  `ctrlKey` -- the only signal browsers give for it -- so the viewer zooms on
  that (and on cmd/ctrl + wheel), anchored at the pointer, and leaves a plain
  wheel to scroll natively. Registered through `@use-gesture`'s `useWheel` with
  `passive: false`, as `MolViewPane` does: React's own `onWheel` is passive at
  the root and could not suppress the browser's page zoom.
- **Save / Copy** are back in the result toolbar. They were dropped as clutter
  while the window had no history; with one, exporting the render you settled
  on is the point of keeping the earlier attempts. Both act on what is on
  screen -- the archived render, or the frame the movie slider is showing --
  and both are file operations in the main process (`RENDER_IMAGE_SAVE` opens
  a native save dialog and copies the file; `RENDER_IMAGE_COPY` writes it to
  the clipboard as a `nativeImage`), since the render window has neither
  filesystem nor clipboard access. A failed export raises an alert rather than
  looking like it worked.
- **Camera defaults follow the target view.** Selecting a render target reads
  that view's projection over a `RENDER_VIEW_CAMERA_GET` round trip (same
  shape as the view-size trip) so a render starts from what the user is
  looking at.

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
    `shared/types/renderWindow.ts` (wire types `RenderWindowCommand` /
    `RenderWindowStateUpdate` / `ViewSizePx`), `shared/ipcContract.ts`.
  - Renderer: `render.html` / `render.tsx` (ErrorBoundary + ThemeProvider
    only; no `installGlobalCrashHandlers`),
    `components/renderwindow/RenderWindowApp.tsx`,
    `components/renderwindow/RenderSettingsPane.tsx` (tab strip) and
    `RenderImageTab.tsx` (Size / Output / Movie sections, composed from
    `ImageSettingsPanel` / `MovieSettingsPanel`),
    `hooks/useRenderWindowBridge.ts` (main window),
    `hooks/useRenderWindowClient.ts` (render window),
    `styles/_render-window.css`.
  - Tests: `__test__/useRenderWindowBridge.test.ts`,
    `__test__/useRenderWindowClient.test.ts`,
    `__test__/renderSettingsPane.test.tsx` (which setting lives on which
    tab), `__test__/renderPanel.test.tsx` (run bar + log-only bottom pane).
- The real two-window relay, `parent` z-order, and the multi-entry build
  cannot be unit-tested (jsdom, single process) — covered by the manual
  checklist in the PR.
- UXP parity reference: `uxp_gui/cuemol2/base/content/tools/render-pov-dlg.{xul,js}`.
