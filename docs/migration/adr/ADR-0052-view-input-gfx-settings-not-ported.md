# ADR-0052: View-input and gfx settings that are not ported

- Status: accepted
- Date: 2026-08-22
- Mapping rows: [`overlay.config-mouse`](../mapping/overlay.md#overlayconfig-mouse), [`overlay.config-misc`](../mapping/overlay.md#overlayconfig-misc)

## Context

The 2026-08-21 migration audit (`mapping/_audit-260821.md` section 1) listed two
UXP settings whose migration decision had never been recorded, both sharing the
same shape: **the C++ backend still exists, but tritium reaches the same user
outcome through a different architecture**, so a literal port would add a
control that either drives nothing or contradicts how tritium renders.

1. **Momentum scroll / multi-touch trackpad / right-button emulation**
   (`config-mouse.xul:41-50` -> `native-widget.js:206-218` -> C++
   `View.trans_mms` / `View.rot_mms`, `View.qif:43-44`).
   [ADR-0036](ADR-0036-settings-panel-wiring.md) removed these from the tritium
   Settings pane as "no-target mocks" while wiring the rest of the pane. The
   audit correctly noted that the C++ properties are real, which made the
   earlier removal look like an oversight.
2. **MSAA sample count** (UXP pref `cuemol2.ui.view.enable_msaa`, default 2,
   read in `cuemol2-prefs.js:46` -> `native-widget.js:117-119`). The audit
   flagged it as untracked and rendering-quality relevant.

## Decision

Neither is ported. Both are recorded as `dropped` on their mapping rows.

**Momentum / trackpad / right-button emulation.** UXP implemented these in its
own mouse driver layer on top of a XUL native widget. In tritium the pointing
device is handled by the browser event stream plus the Electron host: momentum
and multi-touch gestures arrive as wheel / gesture events that the OS already
smooths, and the device-specific behaviour is selected by the
Mouse / Mac-trackpad / **Auto-detect** preset introduced in
[ADR-0032](ADR-0032-view-input-wheel-preset.md) rather than by individual
toggles. Right-button emulation solved a one-button-mouse problem that no
longer applies. The C++ `trans_mms` / `rot_mms` properties stay in `View.qif`
untouched -- dropping the GUI does not remove the capability, and a future
tritium-native input-config surface can adopt them if a real need appears.

**MSAA.** tritium deliberately creates its WebGL2 context with
`antialias: false` (`worker/server/gfx_manager.ts:119`) because the off-screen
frame pipeline owns antialiasing. The equivalent user-facing control is the
scene-level `aa_method` (`none` / `fxaa` / `smaa`, `qsys/Scene.qif:73-91`),
edited through `SceneRenderingSection` in the Inspector. Re-introducing a
global MSAA sample-count preference would either be inert (the default
framebuffer is not multisampled) or fight the post-process path.

## Consequences

- The audit's two "untracked gap" entries close without implementation work;
  the mapping rows now carry the reasoning instead of leaving a silent hole.
- Antialiasing is configured **per scene**, not per application. A user who
  wants a different default for every scene has no single switch today; if that
  turns out to matter, the fix is a scene-default preference feeding
  `aa_method`, not a revived MSAA pref.
- Because the C++ side of `trans_mms` / `rot_mms` remains, a later decision to
  expose them costs only the UI wiring (`settingsConfig.ts` entry plus a worker
  service in the shape of `viewInputParams.service.ts`).

## Notes

- UXP references: `uxp_gui/cuemol2/base/content/config-mouse.xul:41-50`,
  `native-widget.js:117-119,206-218`, `cuemol2-prefs.js:46`.
- tritium references: `worker/server/gfx_manager.ts:101-119` (the
  `antialias: false` decision and its comment), `components/inspector/
  SceneRenderingSection.tsx` (aa_method UI), `components/panes/settings/
  settingsConfig.ts:203-227` (the Input > Mouse & Navigation entries that
  remain).
- Related: [ADR-0032](ADR-0032-view-input-wheel-preset.md) (device presets and
  auto-detect), [ADR-0036](ADR-0036-settings-panel-wiring.md) (the mock removal
  this ADR justifies in hindsight).
