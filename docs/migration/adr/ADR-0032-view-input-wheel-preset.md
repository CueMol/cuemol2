# ADR-0032: View-input wheel binding and tritium mouse/trackpad preset switch

- Status: accepted (Phase 1 host E2E verified on UXP; tritium Phase 2 host E2E pending)
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
pans, `CTRL|WHEEL2` pinch zooms) plus a user-selectable "Pointing device"
preset (Mouse / Mac trackpad). The choice persists as `UiState.inputDeviceMode`
(electron-store), is applied at startup in `createAndInitCueMol.ts` via
`viewInputStyleName(mode)`, and is re-applied live by
`contexts/ViewInputConfigContext.tsx` through the existing
`setViewInputConfigStyle` worker method. The selector lives in `SettingsPane`
(Input > Pointing device). UXP always uses `DefaultViewInConf` (mouse).

## Consequences

- Positive: the physical mouse wheel zooms on every platform; trackpad users
  restore two-finger pan by picking the preset; no new IPC channel or worker
  service was needed (reuses `UiState` and `setViewInputConfigStyle`).
- Negative: tritium cannot auto-detect mouse vs trackpad, so the user must
  pick the preset. The full UXP `config-mouse` key-binding editor
  (`pane-mouseconf`) is not migrated -- only the device preset is. The `.qif`
  edit requires a libcuemol2 rebuild; the XML edit only a data re-install.

## Notes

- Implementation pointers:
  - C++/data: `data/default_style.xml` (`DefaultViewInConf`, `TrackpadViewInConf`);
    `src/qsys/ViewInputConfig.qif` defaults; applied via `data/sysconfig.xml`.
  - tritium: `react-gui/src/renderer/viewInputConfig.ts` (mode -> style map);
    `contexts/ViewInputConfigContext.tsx`; `createAndInitCueMol.ts`;
    `components/panes/SettingsPane.tsx` + `settings/settingsConfig.ts`
    (`input.device`); `shared/ipcTypes.ts` `UiState.inputDeviceMode`;
    `main/stateStore.ts` default.
- Axis facts: `WHEEL1 = deltaX`, `WHEEL2 = deltaY`; wheel -> camera in
  `View::handleMouseDragImpl` (`VIEW_ZOOM`/`VIEW_TRAX`/...).
- UXP parity: `uxp_gui/cuemol2/base/content/cuemol2.js` L57-61 sets
  `vic.style`; the `config-mouse` preference pane is not ported.
- Known issue: a physical wheel and a trackpad two-finger vertical scroll are
  indistinguishable at the `ViewInputConfig` layer in Chromium, hence the
  manual preset rather than auto-detection.
- Tests: `react-gui/src/renderer/__test__/viewInputConfig.test.ts`,
  `viewInputConfigContext.test.tsx`.
