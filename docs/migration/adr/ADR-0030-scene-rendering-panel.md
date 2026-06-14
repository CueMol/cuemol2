# ADR-0030: Scene rendering panel — curated AO/AA/display pane with drag-bracketed undo

- Status: accepted (host E2E pending)
- Date: 2026-06-14
- Mapping rows: [`panel.scene-rendering`](../mapping/panels.md#panelscene-rendering)

## Context

Scene-level rendering settings — ambient occlusion (GTAO), post-process
anti-aliasing, background colour, CMYK colour proofing — are all implemented in
C++ (`qsys::Scene`, `Scene.qif`) and drive a working off-screen render pipeline,
but tritium had no GUI for them. The only way to toggle AO was the temporary
`devRenderOpts.service.ts`, a devtools-console affordance explicitly marked
"remove once the pipeline ships with real UI controls". UXP exposed these via
the generic property tree dialog (`generic-propdlg` / `overlay.propeditor-generic`,
opened from the scene context menu's "Properties…"), whose tritium migration
(ADR-0015 generic inspector) is still primitive-types-only.

The priority is making AO tunable (radius / intensity / slices / steps), which
benefits from live drag preview. Per `option-ux-guidelines.md`, a persistent,
re-editable scene object with valuable live preview routes to a **docked
property panel**, not a modal.

## Decision

Add a curated **`RenderingPane`** to the Explorer side panel (after `ViewPane`),
backed by a new `sceneRenderOpts` worker service and a `useSceneRenderOpts`
hook, mirroring the `ViewPane` / `useViewXform` / `viewXform.service` trio. Four
sections: Ambient Occlusion (enable + radius/intensity/slices/steps sliders +
half-res), Anti-aliasing (method segment none/fxaa/smaa + jitter-SS select),
Background (`ColorField`), Color proofing (use_colproof + ICC profile path +
intent). Every C++ setter calls `setUpdateFlag()`, so all edits are live-previewed.

Undo is explicit per interaction. Discrete controls (switch / segment / select /
colour / text) commit one undo step via `setSceneRenderOpts` `mode:'single'`
(`withUndoTxn`). The AO numeric sliders bracket a drag with
`begin`/`live`/`end`/`cancel` modes — `begin` opens an undo txn, `live` frames
mutate inside it, `end` commits, `cancel` rolls back — so a whole drag (or
arrow-hold) collapses into a single undo step while still previewing every
frame. A keyboard text-edit on a slider (no drag) falls back to `single`,
distinguished by a `draggingRef` flag (same shape as `ViewPane`'s
`TranslationField`).

This panel is deliberately **curated**, distinct from the ADR-0015 generic
property inspector: it surfaces only the rendering/display subset with
purpose-built widgets, ranges, gating (AO sub-controls disabled when AO is off),
and drag-undo, rather than a flat property tree.

## Consequences

- Enables interactive AO tuning (the original goal) and consolidates scene
  display settings into one discoverable pane.
- Supersedes `devRenderOpts.service.ts`; that file is kept for now and removed in
  a follow-up once the pane is host-verified (removing its ServiceMap row and the
  `window.__cm` dev hook).
- Adds a reusable drag-bracketed-undo pattern (begin/live/end/cancel) on top of
  `withUndoTxn`; the worker is FIFO so the bracket ordering holds, and
  `DragNumericField` realtime always fires `onRelease`/`onDragCancel` (incl. on
  unmount) so a txn is never left open.
- `SegmentField` gained a `disabled` prop (mapped to per-option disabled, since
  Blueprint `SegmentedControl` has no whole-control disable).
- Background colour now has two writers: the existing scene context-menu
  white/black radio (`sceneBgColor.service`) and this pane's arbitrary-RGB
  `ColorField` (`sceneRenderOpts` via `makeColor`/`compileColor`). They are
  independent and both undo-wrapped.
- Known limitations: (1) the ICC profile is a free-text path (no file-picker
  yet); enabling proofing with no profile seeds the UXP default `GenericCMYK.icm`.
  (2) Whether AO/AA property writes fire `SEM_SCENE` `PROPCHG` (so undo/redo and
  external scripts refresh the pane) is to be confirmed in host E2E; the pane's
  own optimistic updates work regardless.

## Notes

- Implementation: `components/panes/RenderingPane.tsx`,
  `hooks/useSceneRenderOpts.ts`,
  `worker/server/services/sceneRenderOpts.service.ts` (+ `WorkerCalls.ts`
  ServiceMap rows), registered in `components/panes/index.ts` and
  `components/panels/SidePanel.tsx` (`explorer` group, id `rendering`).
- C++ props (`Scene.qif`): `aoEnabled` / `aoRadius` (4.0) / `aoIntensity` (2.2) /
  `aoSlices` (9) / `aoSteps` (3) / `aoHalfRes`; `aa_method` (none/fxaa/smaa,
  default fxaa) / `aaJitterLevel` (0-5); `bgcolor`; `use_colproof` /
  `icc_filename` / `icc_intent`. Consumed in `qsys/FrameRenderPipeline.cpp`
  (GTAO `AoConstants`) and `qsys/GUIView.cpp`. No libcuemol2 rebuild needed.
- Enum `.qif` props are string ids at runtime (`aa_method`, `icc_intent`) — cast
  `as unknown as number`/`string` at the worker boundary.
- UXP parity: `uxp_gui/.../generic-propdlg.*` (scene props via generic tree),
  `workspace_panel.js onPropCmd` / `cuemol2.js setBgColor`,
  `sceneBgColor.service` `toggleSceneColorProofing` (default-profile seeding).
- Related: [ADR-0015](ADR-0015-generic-property-inspector.md) (generic inspector,
  curated-vs-generic split), [ADR-0025](ADR-0025-view-panel.md) (sibling
  `ViewPane` pattern this mirrors).
