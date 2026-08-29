# ADR-0025: View panel — unbounded DragNumericField fake-dial, relative rotation, command-reused projection

- Status: accepted (host E2E verified; PR pending)
- Date: 2026-06-12
- Mapping rows: [`panel.fakedial`](../mapping/panels.md#panelfakedial)

## Context

The UXP "View" side panel (`uxp_gui/cuemol2/base/content/fakedial-panel.xul` +
`fakedial-panel.js`) edits the active view's camera transform through three
sections — Rotation (RotX/Y/Z, degrees), Translation (TraX/Y/Z, Å), and
Zoom/Slab (Zoom/Slab/Dist, Å). Each control is a custom `<wheelbtn>` XBL widget
(`wheelbtn-bindings.xml`) — a **fake-dial**: an unbounded rotary that accumulates
horizontal drag pixels straight into a value delta with no min/max, paired with a
numeric textbox. The wheel applies *relative* deltas (`rotateView`,
`translateView`, `zoomView`, `slabView`); the textbox sets absolute values.

Tritium already owns view display attributes the UXP panel does not surface
(perspective, center mark) via menu commands (`useViewCommands`) whose state is
cached in `useActiveViewState`, which also drives the native menu checkmarks.
The user asked to consolidate those into the new pane, which raises a
source-of-truth risk: a second writer for the same attributes could desync the
native menu. Background colour is deliberately excluded -- it is a Scene
property, not a View property, so it does not belong on a view-scoped pane.

## Decision

Port the panel as `components/panes/ViewPane.tsx`, placed in the Explorer
activity-bar group in place of the PoC `DummyPane4`.

- **Fake-dial = unbounded `DragNumericField`.** Reuse `h3-kit/form/DragNumericField`
  with `min`/`max` omitted (defaults `-Infinity`/`Infinity`): no clamping, and the
  fill bar is hidden (it requires both bounds finite), giving the Blender-style
  unbounded horizontal-drag rotary that matches the `<wheelbtn>` UX. One field
  replaces each UXP wheel+textbox pair (the field already combines drag + click-to-edit).
- **Rotation is relative-delta.** Rotation has no absolute scalar (it is a
  quaternion), so each rotation field is a transient accumulator: `onChange`
  applies the per-frame delta via the `rotateView` worker service, and the field
  resets to 0 on release — mirroring the UXP wheel's reset-on-release textbox.
- **Translation / Zoom / Slab / Dist are absolute**, bound to live values from a
  new `useViewXform` hook and written through `setViewXform`. The worker clamps
  zoom to `>= 0.01` and slab/distance to `>= 0` (UXP `zoomView`/`slabView` lower
  bounds); the widget itself stays unbounded for the fake-dial feel.
- **View transform is not undo-tracked.** `viewXform.service` setters do **not**
  wrap in `withUndoTxn`, matching `viewProjection.service` — camera manipulation
  is transient view state (like mouse navigation), not an undo step.
- **Projection section reuses existing commands.** Perspective / center mark are
  displayed from `useActiveViewState` values threaded as props and written by
  dispatching the existing `CmdId.View*` commands. Those commands already update
  `useActiveViewState` + the native menu, so that hook stays the single source of
  truth and no second writer is introduced. Background colour is not included
  (Scene property, kept on its existing Scene context-menu / menu surfaces).
- **Live sync** via `useViewXform` subscribing to `SEM_VIEW` `SEM_PROPCHG` events
  (`useCueMolEventListener`, 30 ms debounce) so the absolute fields track mouse
  navigation / scripts; refetch is suppressed mid-drag and reconciled on release.

## Consequences

- New worker surface is minimal: one service file (`viewXform.service.ts`,
  3 methods) + 3 `ServiceMap` rows. The renderer calls them through the generic
  `cm.invokeService<K>` — no dedicated `AsyncCueMol` methods needed.
- The integrated Projection controls cost prop threading (2 values + 2 callbacks)
  through `SidePanel` from `App`, but buy a single source of truth and keep the
  native menu in sync for free.
- Known issue: the rotation fields show a transient accumulator with no
  read-back (they reset to 0 on release). This is intentional UXP parity, but a
  future absolute-angle readout would need a different model (decomposing the
  view quaternion to Euler angles is ambiguous).
- The pane body uses `sp-pane-scroll` (not `sp-pane-fill`, which clips) so the
  sections scroll when they exceed the pane height; `.view-pane-body` supplies
  the form padding + inter-section gap. Rows use `FieldGrid` / `FieldGridRow`
  (aligned label column + filling control) so label and widget share one line.

## Notes

- Implementation:
  - `tritium/react-gui/src/renderer/worker/server/services/viewXform.service.ts`
    (`getViewXform` / `setViewXform` / `rotateView`); registered in
    `worker/shared/calls/` `ServiceMap`.
  - `tritium/react-gui/src/renderer/hooks/useViewXform.ts` (fetch + SEM_VIEW
    subscription + optimistic setters + `beginInteraction`/`endInteraction` gate).
  - `tritium/react-gui/src/renderer/components/panes/ViewPane.tsx` (rows via
    `FieldGrid` / `FieldGridRow`; body `sp-pane-scroll .view-pane-body` for scroll,
    `.view-pane-body` in `styles/_side-panel.css`).
  - Wiring: `components/panes/index.ts`, `components/panels/SidePanel.tsx`
    (`buildViewPaneConfigs.explorer`), `App.tsx` (`handleSetPerspective` /
    `handleSetCenterMark`), `data/appIcons.ts` (`ui.camera`).
  - Tests: `__test__/viewXformService.test.ts`, `__test__/useViewXform.test.ts`,
    `__test__/ViewPane.test.tsx`.
- C++ contract: `src/qsys/View.qif` — `zoom` / `slab` / `distance` /
  `center` (`object<Vector>`) properties and `rotateView(rotX, rotY, rotZ)`
  (relative, degrees). `setViewXform` builds a fresh `Vector` via
  `ctx.svc.createObj('Vector')` for the center.
- UXP parity references: `uxp_gui/cuemol2/base/content/fakedial-panel.js`
  (`onWhChgR`/`onWhChgT`/`onWhChgZs`, `_attachView` SEM_VIEW listener),
  `wheelbtn-bindings.xml` (unbounded drag accumulator).
- Reuses the source-of-truth pattern from `useActiveViewState` /
  `useViewCommands`. Background colour stays on its existing Scene surfaces
  (`panel.workspace.ctxmenu.scene`), intentionally not duplicated here.
