# ADR-0032: View-input wheel binding and tritium mouse/trackpad preset switch

- Status: accepted (host E2E verified through Phase 3 auto-detect, 2026-08-22)
- Date: 2026-06-15
- Mapping rows: [`overlay.config-mouse`](../mapping/overlay.md#overlayconfig-mouse)

## Context

Unifying view navigation into `qsys::ViewInputConfig` (commit `e8961bc4`)
rebound the default mouse wheel from zoom to horizontal/vertical translation,
so a physical mouse wheel panned the view sideways. The bindings are a style
(`DefaultViewInConf` in `data/default_style.xml`, applied at startup) shared by
both the UXP GUI and tritium. The wheel axes are `WHEEL1 = deltaX`,
`WHEEL2 = deltaY` (`src/qsys/View.cpp` `View::mouseWheel`).

A complication is that a *vertical* physical wheel reaches a different axis per
platform: UXP shoves it into `deltaX` (WHEEL1), while Chromium/tritium puts it
into `deltaY` (WHEEL2). Worse, in Chromium a trackpad two-finger scroll and a
physical wheel both arrive as wheel events but want opposite bindings (a mouse
wheel should zoom; a two-finger scroll should pan), and they are
indistinguishable at the `ViewInputConfig` layer.

## Decision

Two phases. **Phase 1** binds `WHEEL1` and `WHEEL2` to `conf_zoom` (and removes
them from `conf_trax`/`conf_tray`) in both `data/default_style.xml`
(`DefaultViewInConf`, runtime) and `src/qsys/ViewInputConfig.qif` (fallback
default). Both axes are bound so a physical wheel zooms regardless of the
platform axis. macOS native (UXP) trackpad is unaffected because its
scroll/pinch gestures call `CglView` directly and bypass `ViewInputConfig`.

**Phase 2** is tritium-only: a second view style `TrackpadViewInConf` (wheel
pans, `GES_PINCH` pinch zooms) plus a user-selectable "Pointing device"
preset (Mouse / Mac trackpad). The choice persists as `UiState.inputDeviceMode`
(electron-store), is applied at startup in `createAndInitCueMol.ts` via
`viewInputStyleName(mode)`, and is re-applied live by
`contexts/ViewInputConfigContext.tsx` through the existing
`setViewInputConfigStyle` worker method. The selector lives in `SettingsPane`
(Input > Pointing device). UXP always uses `DefaultViewInConf` (mouse).

**Phase 3** adds an "Auto-detect" preference (now the tritium default). No
reliable OS signal exists: a spike confirmed Electron 42's observed
`input-event` carries only `type` + `modifiers` (no wheel deltas / precise
flag), and a trackpad two-finger scroll is delivered as a plain `mouseWheel`
identical to a real wheel. So detection is a renderer-side heuristic on the DOM
`WheelEvent` (`input/wheelDeviceClassifier.ts`) fed into a small state machine
(`input/inputDeviceDetector.ts`) with hysteresis and a pinch/rotate "definitely
trackpad" latch. The detected device drives the same `setViewInputConfigStyle`
switch. The preference becomes 3-valued (`mouse|trackpad|auto`); the applied
device stays 2-valued.

## Consequences

- Positive: the physical mouse wheel zooms on every platform; trackpad users
  restore two-finger pan by picking the preset; no new IPC channel or worker
  service was needed (reuses `UiState` and `setViewInputConfigStyle`).
- Auto-detect is heuristic, not exact: there is no OS signal in Electron 42, so
  a high-resolution / free-spin mouse may read as a trackpad and a perfectly
  vertical integer trackpad scroll may read as a mouse. The manual presets are
  the safety net; the classifier thresholds are exported constants for tuning.
- The full UXP `config-mouse` key-binding editor (`pane-mouseconf`) is not
  migrated -- only the device preset. The `.qif` edit requires a libcuemol2
  rebuild; the XML edit only a data re-install.

## Notes

- Implementation pointers:
  - C++/data: `data/default_style.xml` (`DefaultViewInConf`, `TrackpadViewInConf`);
    `src/qsys/ViewInputConfig.qif` defaults; applied via `data/sysconfig.xml`.
  - tritium: `react-gui/src/renderer/viewInputConfig.ts` (mode -> style map);
    `contexts/ViewInputConfigContext.tsx`; `createAndInitCueMol.ts`;
    `components/panes/SettingsPane.tsx` + `settings/settingsConfig.ts`
    (`input.device`); `shared/types/uiPrefs.ts` `UiState.inputDeviceMode`;
    `main/stateStore.ts` default.
- Axis facts: `WHEEL1 = deltaX`, `WHEEL2 = deltaY`; wheel -> camera in
  `View::handleMouseDragImpl` (`VIEW_ZOOM`/`VIEW_TRAX`/...).
- UXP parity: `uxp_gui/cuemol2/base/content/cuemol2.js` L57-61 sets
  `vic.style`; the `config-mouse` preference pane is not ported.
- A physical wheel and a trackpad two-finger scroll are indistinguishable at
  the `ViewInputConfig` layer; the renderer device detector (Phase 3) resolves
  this above that layer, heuristically.
- Auto-detect rejected OS-level detection after a spike: Electron removed
  `scroll-touch-*` (v23, replaced by `webContents.on('input-event')`), but the
  observed `input-event` exposes no wheel deltas (only `type`/`modifiers`) and
  reports a trackpad plain scroll as `mouseWheel`. Detection is therefore
  renderer-side (`input/wheelDeviceClassifier.ts`, `input/inputDeviceDetector.ts`,
  driven from `MolViewPane` wheel + pinch + the rotate IPC, applied via
  `ViewInputConfigContext`). Preference persists as `UiState.inputDeviceMode`
  (now `mouse|trackpad|auto`, default auto) + `UiState.inputDeviceDetected` seed.
- Classifier polarity is platform-specific and counter-intuitive (verified on
  hardware): on macOS a physical mouse wheel arrives as a FRACTIONAL deltaY
  (Chromium scales it) and a trackpad as INTEGER precise-pixel deltas, so
  fractional -> mouse, integer -> trackpad; a horizontal deltaX is trackpad on
  any platform. Off macOS the split is unvalidated (clean vertical -> mouse);
  the detector receives `isMac` from `electronAPI.platform`.
- Pinch binding uses `GES_PINCH`, not `CTRL|WHEEL2`: Chromium signals a
  trackpad pinch as a wheel event with `ctrlKey=true`, but `MolViewPane`
  intercepts that and re-emits it as a `GES_PINCH` gesture (ctrl stripped), so
  a `CTRL|WHEEL2` wheel binding would never match. `DefaultViewInConf` already
  binds `GES_PINCH` for the same reason.
- Trackpad rotation works on macOS via `GES_ROTATE`: Chromium emits no DOM
  event for a two-finger rotate, but Electron main's BrowserWindow
  `rotate-gesture` event (`main/windowManager.ts`) forwards it over
  `IPC.ROTATE_GESTURE` to `MolViewPane`, which dispatches `GES_ROTATE`. So
  `TrackpadViewInConf` must bind `GES_ROTATE` on `conf_rotz` (as
  `DefaultViewInConf` does) for rotation to route. On non-macOS that event
  never fires, so rotation is left-drag there.
- Tests: `react-gui/src/renderer/__test__/viewInputConfig.test.ts`,
  `viewInputConfigContext.test.tsx`, `wheelDeviceClassifier.test.ts`,
  `inputDeviceDetector.test.ts`.
