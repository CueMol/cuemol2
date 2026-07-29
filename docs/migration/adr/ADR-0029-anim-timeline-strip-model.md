# ADR-0029: Animation panel — strip-timeline model and detail inspector

- Status: accepted (anim panel migration complete; Phases 1-6 host E2E verified, Phase 7 timeedit verified locally)
- Date: 2026-06-13
- Mapping rows: [`panel.anim`](../mapping/panels.md#panelanim), [`dialog.animobj`](../mapping/other_dlgs.md#dialoganimobj)

## Context

A CueMol animation element is a C++ `AnimObj` with a **time range** (`absStart`
.. `absEnd`), not a point keyframe. UXP exposes them through (a) an ordered
`<tree>` (Name / Start / End, row index == `AnimMgr` index), (b) a 1D transport
slider in `anim-ribbon` (Play / Pause / Stop / Loop + `elapsed`-based scrub —
**no graphical timeline widget exists**), and (c) a modal property dialog
`animobj-propdlg` with a per-type "Common" tab (`animobj-common-proppage`) plus a
generic property tab (`propeditor-generic-page`). Time is edited only through
numeric `timeedit` fields.

The pre-existing tritium panel was a **mock** built on a keyframe model
(`Keyframe` / `AnimationTrack`) that does not map to the time-ranged `AnimObj`
(a point cannot represent a duration, and the mock drove no real 3D playback).

Two C++ facts shape the design: an `AnimObj` is owned by `AnimMgr` (an ordered
list), **not** the scene object table — so the generic property bridge
(`resolvePropTarget` / `genericProps.service`) cannot target it; and `AnimMgr`
exposes no `getByUID`, while the global `qlib::ObjectManager` registry keeps
removed-but-undoable elements registered (a `removeAt` undo holds a strong
`AnimObjPtr`), so a registry lookup is liveness-incorrect.

## Decision

Rebuild the panel as a **Blender-style strip timeline** (1 `AnimObj` = 1 lane
bar drawn at `absStart`..`absEnd`) with a transport header and a left channel
list, backed by a new `animation.service` + `useAnimTimeline` / `useAnimTransport`
hooks. Bars are drawn from the resolved `abs*` times; edits write the relative
`start`/`end` and call `resolveRelTime()`. No new C++ capability is required
(every operation backs onto an existing `AnimMgr`/`AnimObj` wrapper method).

The UXP modal property dialog is migrated to the **right `InspectorPanel` as a
self-fetching `animElement` target** (`AnimElementInspector`), not a modal or
drawer — the same docked-inspector pattern the renderer/object nodes use. It
carries a **Properties / Generic `SegmentField` mode switch identical to the
renderer node inspector**: Properties is a bespoke per-type editor mirroring
`animobj-common-proppage` (UXP labels and layout), and Generic reuses the
existing `GenericTab` over the `AnimObj`'s `getPropsJSON()`. Identity is the
stable `AnimObj.uid`; every service resolves it by a **liveness-correct linear
scan** of `AnimMgr`'s current list (`findByUid`).

## Consequences

- **Enables:** a duration-first timeline that matches the C++ model 1:1; real
  3D playback (the worker pumps idle tasks each frame so `AnimMgr.start(view)`
  advances); full per-type editing of every element subtype from a non-modal
  inspector; and a power-user Generic tab covering every `AnimObj` property
  (incl. ones the bespoke editor omits) with live-apply + undo.
- **No C++/`.qif` changes** for the inspector — `AnimObj` is a `BaseWrapper`, so
  `getPropsJSON` / `setProp` / `resetProp` already exist; the Generic services
  are thin wrappers around `findByUid` + the shared `parseGenericProps` machinery.
- **Costs / deferred:** `AnimMgr.length` auto-overwrites to `max(absEnd)` (length
  shown read-only, no length field); `start>end` is silently clamped by C++
  (pre-clamped renderer-side); no position-change event during playback (the
  transport polls `elapsed` at ~15 Hz); element `type` has no getter (derived
  from the wrapper class name); offline movie render (POV-Ray + ffmpeg) is out of
  scope. Inspector-specific notes: multi-renderer target picking and the rename
  timeRefName cascade are implemented (Phase 6, below); numeric edits commit on
  release only -- realtime drag preview is intentionally NOT used because an anim
  element's prop does not live-update the 3D mid-drag (the 3D reflects only the
  playhead-time application). The UXP `timeedit` widget is ported in Phase 7
  (below) as the reusable h3-kit `TimeField`, so no UXP-parity gaps remain
  (offline movie render stays a separate, out-of-scope workstream).

## Notes

### Data model and playback
- `types.ts` `AnimElement` (1 AnimObj = 1 strip; all times ms = `TimeValue.millisec`):
  `index` (volatile `AnimMgr` position), `uid` (stable), `name`, `type` (derived),
  `disabled`, `timeRefName` (`''` = absolute), `start/end` (relative — what edits
  write), `absStart/absEnd` (resolved — bar geometry), `quadric`, `typeProps`.
- `playState` is a `.qif` `enum` so the wrapper returns the string id at runtime
  despite a `number` TS type — used directly as `'stop'|'play'|'pause'`.
- Playback driving: the worker has no live libuv timer (EventManager auto-start is
  commented out), so `gfx_manager` calls `cuemol.performIdleTasks()` each frame
  (a `performIdleTasks` N-API export) to advance `AnimMgr` playback / `setTimer`
  work. Without this, Play scrubbed but did not animate.
- Sync is event-driven: `useAnimTimeline` / `AnimElementInspector` subscribe
  `srcMask: SEM_ANIM`, `evtMask: SEM_ANY`, `scopeId: sceneId`, `debounceMs: 30`.
  The SEM payload carries no uid, so listeners always re-resolve the full list.

### uid resolution (liveness-correct)
- `findByUid(mgr, uid)` scans `mgr.getAt(i)` for `i in 0..size` and matches
  `obj.uid`. This `m_data`-scoped scan is the **only liveness-correct accessor**:
  the global `ObjectManager` `getByUID` would return removed-but-undoable elements
  (the `removeAt` undo holds a strong `AnimObjPtr`, AnimObj is a `LUIDObject`), so
  the registry path was **rejected**. Element counts are small, so O(n) is fine.
- Renderer-supplied volatile `index` is never trusted for identity; the detail
  payload intentionally omits the index.

### Inspector integration
- `useInspectorState` gains an `{kind:'animElement'; sceneId; uid}` target
  (precedent: the bottom Render panel already drives the inspector's non-node
  `renderSettings` target). `AnimationPanel` emits the selected uid via
  `onInspectAnimElement`; deletion / scene-switch clears it (panel effect +
  worker `gone` signal). The PROPCHG listener in `useInspectorState` is gated to
  `kind==='node'`; anim sync lives entirely in the component's SEM_ANIM listener.
- `AnimElementInspector` self-fetches (the generic bridge can't target an
  AnimObj). An `editingRef` gate keeps an in-progress draft from being clobbered
  by a refetch and is **cleared on element switch** so a new element always
  re-seeds its form (a prior non-committing release once latched it -> permanent
  "Loading..."; fixed).

### Per-type editor + UXP-parity labels
- Labels and layout mirror `animobj-common-proppage.xul`: Common settings
  (Name / Disabled / Relative to / Start / Duration / **Quadric**), and per-type
  groups — SimpleSpin (Rotation angle / Spin axis), CamMotion (Target camera +
  Ignore rotate/center/zoom/slab), Show/Hide & Slide (Target renderers /
  Show-Hide dropdown / Fade / Target opacity / Direction angle / Distance "W/2"),
  MolAnim (Target MorphMol / Start value / End value).
- UXP numslider widgets map to the form-kit `DragNumericField`; the spin-axis
  x/y/z boxes (plain number fields in UXP, not sliders) map to the catalog
  `NumberCell`. The numslider->DragNumericField rule is recorded in the UI style
  guide (`docs/migration/ui-style-guide.md` §0).

### Quadric 0 (= linear / no easing)
- UXP and the initial port both guarded `new_val > 0` (UXP
  `animobj-common-proppage.js:188`), so the slider could never return to the
  no-easing default. `AnimObj::setQuadric` (`src/qsys/anim/AnimObj.cpp:48`) maps
  any `val < 0.01` to `m_quadric = -0.0` with `m_grad = 1.0` (so `convRho` is the
  identity = linear) and sets the coefficient directly, avoiding the
  `1/(2q(1-q))` division by zero. 0 is therefore a valid value. The redundant
  guard was dropped in **both** GUIs (tritium commits the value unconditionally;
  UXP relaxed to `new_val < 0.0`). No C++ change.

### Spin axis — Cartesian-only editing
- UXP `axisMenuChanged` / `disableAxisEdit` disable the x/y/z boxes for the
  X/Y/Z axis presets and enable them only for "Cartesian". tritium reproduces the
  disable behaviour and uses a **hybrid combobox mode**: an `axisMode` state that
  is `null` (derive from the current vector) initially and holds the user's
  explicit pick until the element changes — so editing a Cartesian vector to a
  unit value does not snap the mode back to a locked axis.

### Generic tab (reuse, not reinvent)
- New worker services `getAnimElementGenericProps` / `setAnimElementGenericProp`
  / `resetAnimElementGenericProps` resolve the AnimObj by `findByUid` and reuse
  the shared generic machinery: `parseGenericProps(obj.getPropsJSON())` for the
  list, and `obj.setProp` / `obj.resetProp` inside a `withUndoTxn` for writes.
  The renderer reuses the `GenericTab` component and `modifiedKeys` /
  `InspectorResetAllButton` (same UI as the node inspector, ADR-0015).

### Phase 6 / 7 -- multi-renderer targets, rename cascade, list sync, timeedit
- **multi-rend:** ShowHide/Slide `rend` is a comma-joined bare-name list that C++
  `RendPropAnim` splits to target several renderers (`src/modules/anim/
  RendPropAnim.cpp` `val.split(',', ...)`). The inspector renders a scrollable
  checklist (one checkbox per renderer option); toggling re-joins the set and
  commits the comma string. No worker/C++ change.
- **timeRefName cascade:** `setAnimElementProp` "name" captures the old name,
  writes the new one, then retargets every sibling whose `timeRefName` matched the
  old name -- all in the one rename undo txn, so the relative-time chain is not
  orphaned and undo reverts the rename + retargets together.
- **Target-list sync:** the renderer / camera / mol options refetch on
  `SEM_OBJECT | SEM_RENDERER | SEM_CAMERA` (any event, scene-scoped, 50ms
  debounce), so an Explorer add / delete / rename keeps the checklist and the
  camera / mol selects current (they previously fetched only on scene change).
- **timeedit:** Start / Duration use the reusable h3-kit `TimeField`
  (`h3-kit/form/TimeField.tsx`: ms <-> `M:SS.mmm` / `H:MM:SS.mmm`;
  `formatMs` / `parseTime` exported) instead of raw-ms DragNumericFields,
  mirroring the UXP `timeedit` widget. end = start + duration commits one
  `timing` write; no worker change. Its interaction model is covered below.

### TimeField interaction (why not UXP's segmented spinner)

The first port was text-only -- typed timecode committing on blur / Enter -- so
UXP's up / down spin buttons, the one way to nudge a value there, had no
equivalent. Surveying how animation tools take time input:

- **DCC / editing apps** (Blender, After Effects, Premiere, Resolve, Maya)
  converge on **one field that scrubs on horizontal drag** and accepts typing;
  explicit spinners are rare (Blender only reveals `<` `>` on hover), and the
  timecode apps add `+` / `-` relative entry.
- **Segmented boxes + a shared spinner** is an OS form-widget pattern -- UXP's
  `timeedit` is literally Mozilla's `datetimepicker` XBL reused, not an
  animation-tool UI.
- 3D apps (Blender / Maya / Unity) work in **frames**, which CueMol cannot: fps
  is display-only (30) with no C++ property, and `AnimObj` stores ms.

So `TimeField` was rebuilt as a **`DragNumericField` preset** -- the catalog
already implements that interaction model (pointer-lock drag, auto-repeat step
arrows, modifier snaps, one-interaction-one-undo-step), so this is a reuse, not
a new widget. `DragNumericField` gained only optional props: `format` / `parse`
(non-decimal display and entry; `parse` switches the edit input to
`type="text"`), `stepper="stacked"` (an up / down pair at the right edge instead
of the side `<` `>`, the SliderField stepper shape), `resolveStep` (per-
interaction step granularity, which also opts the field into Up / Down keys),
plus `className` / `aria-label` / `title`. Its 34 existing tests were unchanged.

Resulting model: drag snaps to 0.1 s (Shift 1 ms -- also the stored resolution,
so a typed `.345` survives -- Ctrl / Cmd 1 s); the spin buttons and Up / Down
step **the segment the caret is in**, defaulting to seconds when nothing is
selected and stepping the fraction by 100 ms, which is exactly UXP's
`_increaseOrDecrease` (`_currentField || _fieldSecond`, `change *= 100` for the
millisecond box). Typed entry additionally accepts a unit-suffixed number
(`250ms`, `1.5s`, `2min`) and a `+` / `-` offset (`+2s`, `-1:30`). The magnitude
grammar is shared between the absolute and relative forms, so an unsuffixed
number stays seconds in both (`10` = 10 s, `+10` adds 10 s) rather than adopting
the timecode apps' "bare number = smallest unit" rule; a tooltip carries the
accepted forms, which are otherwise undiscoverable.

Two interaction bugs found and fixed while building it, both regression-tested:
a key step after the click's select-all parked the caret at offset 0, so repeats
drifted from seconds to minutes (the widget now restores "whole draft selected"
instead); and a pending key-step hold also fired on the keyup after Enter,
committing the same value twice.

### Known issues / scope
- `AnimMgr.length` auto = `max(absEnd)`; `start>end` silent clamp; no per-frame
  position event (poll); `classNameToType` heuristic for element type; uid reuse
  window minimised by a mount-time gone-check; `resolveRelTime()` can throw on a
  cyclic/missing ref (swallowed per-field so it cannot roll back an unrelated
  edit). Offline movie render is a separate workstream (see `dialog.anim-render`).

### References
- UXP: `uxp_gui/cuemol2/base/content/anim/` (`anim-panel.*`,
  `animobj-common-proppage.*`, `animobj-propdlg.xul`, `anim-slider-bindings.xml`).
- C++: `src/qsys/anim/AnimMgr.{qif,cpp}`, `src/qsys/anim/AnimObj.{qif,cpp,hpp}`.
- Plan: `docs/migration/anim-panel-timeline-plan.md` (Phase 0-5 roadmap).
- Related: ADR-0015 (generic property inspector — the reused getPropsJSON bridge).
- Implementation: `worker/server/services/animation.service.ts`,
  `animDetail.service.ts`, `helpers/animResolve.ts`, `helpers/animElementType.ts`;
  `hooks/{useAnimTimeline,useAnimTransport,useAnimEdit}.ts`;
  `components/panels/AnimationPanel.tsx` (+ `panels/anim/*`);
  `components/inspector/AnimElementInspector.tsx`; `hooks/useInspectorState.ts`;
  `worker/server/gfx_manager.ts` + `init_cuemol.cpp` (idle pump).
- Tests: `__test__/{animDetailService,animElementInspector,animationPanel,
  useInspectorState}.test.*`.
