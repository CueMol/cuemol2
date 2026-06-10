# ADR-0023: Measure tool — distance / angle / torsion pick port

- Status: accepted (host E2E verified; PR pending)
- Date: 2026-06-10
- Mapping rows: [`toolbar.cuemol2-ribbon`](../mapping/toolbars.md#toolbarcuemol2-ribbon)

## Context

UXP's Measure ribbon tab (`uxp_gui/cuemol2/base/content/topbar/measure-toolribbon.js`)
lets the user click atoms in sequence to create distance (2 picks), angle (3),
or torsion (4) labels. While picking it shows a crosshair at each picked atom
(`DistPickDrawObj`), and a renderer-name dropdown (`measure-ribbon-tgtlist`)
chooses which `atomintr` renderer the labels are appended to. tritium has no
ribbon; viewport tools live in the floating `ViewportToolPalette`, and a
horizontal options strip would re-create the legacy ribbon look the palette was
meant to avoid. The pick state, feedback, label creation, and target selection
all had to be re-homed idiomatically. The crosshair is the crux: a measure
sequence spans multiple discrete clicks with camera rotation/translation
possible *between* picks (unlike rect-select's single continuous drag), so the
feedback must stay anchored to the 3D atoms across camera moves.

## Decision

Port the pick state machine into a worker service and the feedback into the
existing C++ 3D draw object.

- **Worker** (`worker/server/services/measure.service.ts`): a per-view pick
  buffer is module-level worker state (the worker is the single source of truth
  for picks). `measurePick` resolves each click via `view.hitTest`, accumulates,
  and on reaching 2/3/4 picks creates the label through the `atomintr`
  renderer's `appendById` / `appendAngleById` / `appendTorsionById` inside one
  `withUndoTxn("Define <Mode> Label")`. The renderer is created on the *first*
  pick's molecule and every later atom passes its own object uid, so a
  measurement may span molecules (UXP parity). `defineMeasureLabel` reuses the
  renderer named by the chosen target (`getRendererByNameType`) or creates one
  with that name; an empty target uses the default name `"measure"`.
  `measureReset` cancels an in-progress sequence; `measureListTargets`
  enumerates existing `atomintr` renderer names from `getSceneDataJSON`.
- **Renderer** (`hooks/useMeasureClickHandler.ts`): subscribes to the C++
  `mouseClicked` event while a measure tool is active (parallel to
  `useNaviClickHandler`, which is gated to navigate/rectSelect so the two never
  both fire). Measure tools leave `RectSelectOverlay` click-through, so camera
  drag reaches the C++ view between picks and a click emits `mouseClicked`.
  Reset fires on tool/view change and on Escape. The target name lives in
  `ContentPane` state and flows into each `measurePick`.
- **Feedback**: reuse the C++ `DistPickDrawObj` (a 3D `DrawObj` rendered by
  `View::showDrawObj`, the same path as the center mark), *not* a 2D DOM/SVG
  overlay — only a 3D mark re-projects each frame and stays on the atoms as the
  camera moves.
- **Target UI**: a distinct "options cap" on the palette (above the measure
  tools — shorter, muted, sliders icon + caret, no active state, so it reads as
  group settings not a fourth tool) opens a Blueprint `Popover`
  (`MeasureOptionsPopover`) with a text field plus the existing-name list. This
  replaces the UXP dropdown without a legacy ribbon strip.

## Consequences

- Cross-molecule measurements work for free via the per-pick object uid.
- Camera navigation between picks works with no extra code (overlay
  click-through + C++ view drag), and the 3D crosshair tracks the atoms.
- Reset-on-tool/view-change + Escape prevent a stale first pick from combining
  with a later one.
- Porting the feedback surfaced three pre-existing C++ bugs in `DistPickDrawObj`
  that the GpuPrim migration had left: the vertex colour was a hardcoded ARGB
  literal (`0xFFFFFF80`) that put the intended 0.5 alpha into the blue byte
  (opaque pale-yellow); the line width was set once in `init()` and cached, so
  it never took effect; and the mark size was small. Fixed by driving the colour
  from the `m_color` property, setting the width every frame scaled by
  `getPixSclFac()`, and doubling the arm length. These fixes also harden any
  future `DistPickDrawObj`/wide-line user.
- Deferred / out of scope: the degenerate-pick guard only rejects identical
  atoms (and coincident angle endpoints), matching UXP — near-collinear angles
  and near-coplanar torsions are not rejected. Editing/removing individual
  measurements from the tool is out of scope (that is the `atomintr` property
  dialog, tracked by `dialog.atomintr`).

## Notes

- Worker: `measure.service.ts` (`measurePick` / `measureReset` /
  `measureListTargets`), contract rows in `worker/shared/WorkerCalls.ts`
  `ServiceMap`; undo via `worker/server/services/withUndoTxn.ts`.
- Renderer: `hooks/useMeasureClickHandler.ts`, `components/ViewportToolPalette.tsx`
  (options cap + `Popover`), `components/MeasureOptionsPopover.tsx`,
  `components/panes/ContentPane.tsx` (target state), styles in
  `styles/_viewport-tool-palette.css`.
- C++: `src/modules/molvis/DistPickDrawObj.{cpp,qif}` (colour/width/size);
  feedback path `src/qsys/View.cpp` `getDrawObj` / `showDrawObj`. Note: `.qif`
  property defaults are not applied to `getDrawObj`-created instances, so the
  C++ constructor defaults are what render.
- Tests: `__test__/measureService.test.ts` pins the state machine, create/reuse
  order, undo label, degenerate cancel, angle/torsion arg order, feedback, and
  target listing.
- UXP parity: `measure-toolribbon.js` `onMouseClicked` / `defineDistLabel` /
  `onTgtListShowing`; dispatch via `tool-ribbon.js`.
- Related: [ADR-0013](ADR-0013-toolbar-ribbon-port.md) (the palette this tool
  lives on).
