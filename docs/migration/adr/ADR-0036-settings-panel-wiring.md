# ADR-0036: Settings panel wiring — atom-label & view-input defaults via user style, mock cleanup

- Status: accepted (host E2E verified 2026-08-22)
- Date: 2026-07-05
- Mapping rows: [`overlay.config-misc`](../mapping/overlay.md#overlayconfig-misc), [`overlay.config-mouse`](../mapping/overlay.md#overlayconfig-mouse)

## Context

The tritium SettingsPane (`components/panes/SettingsPane.tsx` + catalogue
`settings/settingsConfig.ts`) shipped with 32 settings of which only 5 were
wired to a real backend (theme, POV-Ray/blendpng paths, pointing device). The
other 27 wrote to a local `values` useState and were lost on unmount.

Two kinds of mock existed: (a) controls with a real backend that were simply
not wired, and (b) controls with no setting target at all. The UXP options
dialogs are the parity reference: `config-dialog.js` (atom-label defaults) and
`config-mouse.js` (mouse scalars) both wrote to the C++ StyleManager "user"
style set; other UXP preferences used the XPCOM pref service.

This split dictates persistence. Preferences that UXP stored via XPCOM prefs map
to electron-store in tritium (already the case for `input.device` =
`UiState.inputDeviceMode`). Values that UXP stored as **user-defined style** must
persist the UXP way — into the "user" style set saved to `user_styles.xml`.
tritium loaded `user_styles.xml` at startup (`createAndInitCueMol.loadUserStyle`)
but had **no save path**, so user-style edits never survived a restart.

## Decision

Wire the two backend-backed mock groups and delete the rest.

- **Atom-label defaults** (font/size/color/bold/italic) -> StyleManager
  `DefaultLabel.*` via a new worker service `labelDefaults.service.ts`
  (`getStyleValue(0, "", ...)` to read, `setStyleValue(0, "user", ...)` +
  `firePendingEvents()` to write), surfaced through `AppSettingsContext`.
  Mirrors UXP `config-dialog.js`.
- **Mouse XY-rotation sensitivity / pick precision** -> the global
  `ViewInputConfig` singleton `tbrad` / `hitprec` via
  `viewInputParams.service.ts`; each write also persists into the user style
  set under `UserViewConf.*` (two-step write mirroring UXP `config-mouse.js`).
- **User-style persistence** -> new `saveUserStyle` worker path
  (`workerLifecycle.saveUserStyle` -> `saveStyleSetToFile(0, hasStyleSet('user',0),
  path)`), triggered on window close via `useWindowCloseHandler`'s new
  `onBeforeProceed` hook (App.tsx `saveUserStyleOnClose`, path from
  `IPC.APP_PATH`). This mirrors UXP `Qm2Main.onUnLoad` and is NOT electron-store.
- **`mouse.preset` dropped**: its options (`Maya-like`/`PyMOL-like`/`Custom`) are
  not real ViewInputConfig styles, and `vic.style` is already owned by the
  `input.device` selector (ADR-0032) — wiring it would create two controls
  fighting over the same property.
- **All no-target mocks removed** (rendering AA/shadows/AO/fog/HiDPI, extra
  colours, keyboard, trackpad, general/language/updates/privacy, momentum
  scroll), pruning the now-empty categories. The catalogue goes 32 -> 13, all
  real and persistent.

## Consequences

- Every remaining setting is backed and persistent; the pane no longer presents
  controls that silently do nothing.
- `saveUserStyle` closes a standing gap (the user style set was loaded but never
  saved), benefiting any future global-style editing feature.
- Persistence occurs on window close (UXP parity). A force-quit or crash loses
  unsaved user-style edits — the existing close watchdog is unchanged and a save
  failure is swallowed so it can never wedge the close.
- Changing a `DefaultLabel.*` default affects newly created and non-overridden
  labels; renderers that already overrode the property keep their value (UXP
  behaviour, driven by `firePendingEvents`).
- `tbrad`/`hitprec` are singleton (global) properties — one setter affects all
  views; restored at startup because the applied input style always appends
  `,UserViewConf`, whose scalars `ViewInputConfig.applyStyle` re-reads.
- Background colour is intentionally NOT surfaced as an app-global setting: it is
  a per-scene property (`scene.bgcolor`) already reachable from the scene context
  menu; there is no global-default backend, so its mock was removed rather than
  wired.

## Notes

- Atom-label font picker (UXP config-misc parity, improved): the font list is
  populated from installed system fonts via the Local Font Access API
  (`window.queryLocalFonts()`, `hooks/useSystemFonts.ts`; main grants the
  `local-fonts` permission in `main/index.ts`) with a curated fallback; each
  option renders in its own typeface. A live `AtomLabelPreview` shows sample text
  in the exact CSS font shorthand the C++ renderer builds
  (`Canvas2DTextRender2::setupFont`, mirrored in `settings/labelFont.ts`) plus
  the chosen colour -- reflecting family/size/weight/style/colour, vs UXP which
  previewed only family/bold/italic at a fixed 20px with no colour.
- Services: `worker/server/services/labelDefaults.service.ts`,
  `viewInputParams.service.ts`; lifecycle `worker/server/workerLifecycle.ts`
  (`saveUserStyle`); `ServiceMap`/`MethodMap` rows in `worker/shared/WorkerCalls.ts`.
- Renderer: `contexts/AppSettingsContext.tsx` (provider mounted in `index.tsx`);
  routing in `SettingsPane.tsx` + key maps `LABEL_DEFAULT_SETTING_KEYS` /
  `VIEW_INPUT_PARAM_SETTING_KEYS` in `settingsConfig.ts`; close hook in
  `hooks/useWindowCloseHandler.ts` (`onBeforeProceed`) wired from `App.tsx`.
- UXP parity: `uxp_gui/cuemol2/base/content/config-dialog.js:37-42,159-168`
  (DefaultLabel), `config-mouse.js:50-76` (tbrad/hitprec + UserViewConf),
  `cuemol2.js:297-304` (`Qm2Main.onUnLoad` user-style save).
- Related: [ADR-0032](ADR-0032-view-input-wheel-preset.md) (device preset owns
  `vic.style`), [ADR-0016](ADR-0016-window-close-quit-funnel.md) (close funnel
  the save hook piggybacks on).
- Tests: `__test__/labelDefaultsService.test.ts`,
  `viewInputParamsService.test.ts`, `saveUserStyleService.test.ts`,
  `windowCloseFlow.test.tsx` (onBeforeProceed), `workerServiceDispatch.test.ts`.
