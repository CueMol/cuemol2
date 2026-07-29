# ADR-0040: Animation (movie) rendering — Still/Animation mode in the Rendering window, and AnimMgr state restore

- Status: accepted (host E2E verified 2026-07-25; both backends)
- Date: 2026-07-20
- Mapping rows: [`dialog.anim-render`](../mapping/other_dlgs.md)
- Related: [ADR-0035](ADR-0035-render-window.md) (the window this extends),
  [ADR-0017](ADR-0017-povray-rendering-ui.md) (the worker pipeline this
  extends), [ADR-0029](ADR-0029-anim-timeline-strip-model.md) (the animation
  panel that drives the same `AnimMgr`),
  [ADR-0043](ADR-0043-movie-output-lifetime.md) (where the output goes, how
  long the frames and the movie live, and how a failed encode is detected)

## Context

UXP `anim-render-dlg` is a modeless dialog: the main window stays usable
while frames render. In practice that freedom is hollow. `AnimMgr::writeFrame`
calls `onTimerImpl`, which mutates the live scene's renderer/object
properties on every frame, so editing the target scene mid-render corrupts
the output. Editing *other* scenes, on the other hand, is genuinely useful —
a movie render takes minutes and should not block unrelated work.

tritium already has most of what this needs. ADR-0035's Rendering window is
a modeless child `BrowserWindow` that never blocks the main window, keeps
running when closed, and — critically — already separates the render target
from the active scene (`hooks/useRenderWindowClient.ts:10-15`). The intent to
fold animation into it is already recorded in code:
`shared/menuTemplate.ts:116-118` says animation rendering becomes a
Still/Animation mode in the same window, which is why the separate
"Animation rendering" menu item was removed on 2026-07-11.

A second, larger problem surfaced while scoping this. `AnimMgr`'s property
writes happen outside any undo transaction — there is no `startUndoTxn` in
`startImpl` / `onTimerImpl` / `writeFrame`. Playing an animation therefore
changes scene state that the undo stack has no record of, so a later undo
leaves the scene and the undo history disagreeing. This is not specific to
rendering: the same drift happens on ordinary timeline playback from the
animation panel, which is the more common path. UXP has shipped with this
for years without reported incidents, but it is a real correctness gap.

## Decision

**1. UI shape.** Add a Still/Animation mode to the existing Rendering window
rather than a new surface. No new menu item, no new `CmdId` — `MENU_POV_RENDER`
-> `CmdId.UiRenderWindow` -> `RENDER_WINDOW_OPEN` stays the single entry
point. The Animation mode extends `RenderSettingsEditor` with a frame-range
group (start/end/fps, output directory, base name) and a movie-encoding group
(ffmpeg format, bitrate), and `renderJob.service.ts` grows a frame loop that
drives `AnimMgr.setupRender` / `writeFrame` per frame before handing the PNG
sequence to ffmpeg. The `option-ux-guidelines.md:95` recommendation of a
drawer/docked panel for `anim-render` does not apply: ADR-0034 tried the
docked shape for `render-pov` and it was retired in favour of ADR-0035's
window.

**2. No scene duplication.** Rendering from a private copy of the scene would
make every concurrency concern vanish, and it was confirmed feasible (see
Notes). It is not implemented. libcuemol2 has no scene- or object-level copy
(`Scene` and `Object` both derive from `qlib::LNoCopyScrObject`), and the
qsc-roundtrip shortcut is closed because `SceneXMLWriter::write()` is the
save-as path: it rewrites the source scene's basePath and, through
`Object::convSrcPath(bSetProp=true)`, every object's `src` property.
A correct `SceneManager::duplicateScene` is a 300-500 line addition. Given
that CueMol2 has shipped the destructive behaviour for years without
incident, this is recorded as a future option, not current work.

**3. Restore animated properties on stop.** `AnimMgr` saves the pre-animation
value of every property it animates and restores it when playback fully
stops:

- **Save** in `startImpl()`. The `prop_tl` map already built there
  (`AnimMgr.cpp:95-144`) enumerates the `(target uid, PropAnim)` pairs, so
  the *targets* need no new discovery pass — but the *property list* does.
  `getPropName()` is not the full set of what an anim writes:
  `ShowHideAnim` returns `"visible"` yet writes both `visible` and `alpha`
  (`ShowHideAnim.cpp:48-58`), and `RendXformAnim` calls `setXformMatrix()`
  directly (`RendXformAnim.cpp:40`). Each subclass therefore declares what it
  touches through a new `PropAnim::onPropSave(AnimMgr*, uid_t)` hook that
  pushes current values into an `AnimMgr`-owned save map; restore is generic
  (resolve uid via `SceneManager::getRendererS`, falling back to
  `getObjectS` for `MolAnim`, then `setProperty`).
- **Restore** in `stop()`.
- **`pause()` does not restore** — a paused animation legitimately holds a
  mid-animation state. Note `pause()` itself transitions to `AM_STOP` when
  the remaining time is zero (`AnimMgr.cpp:187-190`), and `goTime()` ends by
  calling `pause()`; restore must key off the explicit `stop()` call, not off
  reaching `AM_STOP`, or seeking to the end of the timeline would revert.
- **Natural end of playback must also restore.** `onTimer(bLast=true)`
  resets the state inline without calling `stop()` (`AnimMgr.cpp:293-303`) —
  the most common path (press Play, let it finish) would otherwise leak. When
  `m_loop` is set it calls `start()` again, so the save must not be
  overwritten on the second and later laps.

`goTime()` falls out correctly with no extra code: it is
`stop() -> startImpl() -> apply events -> pause()`, so each seek discards the
previous seek's residue before applying the new time. `setupRender()` also
routes through `startImpl()`, so offline rendering gets the same guarantee
once the render path calls `stop()` on completion or abort — which UXP never
did (`anim-render-dlg.js` leaves `AnimMgr` in `AM_RUNNING` and the scene at
the last frame).

**4. No target-scene lock during rendering.** Editing the target scene
mid-render still corrupts the output; nothing prevents it. The same reasoning
as (2) applies — users watching a render do not concurrently edit the scene
being rendered, and no incident has been reported. The Rendering window
displays which scene is being rendered so the state is at least visible.

**5. Playback-time edits unchanged.** Editing a property while an animation
plays still conflicts with the restore set (the saved value wins on stop).
Left as-is; see Consequences.

**6. umbreon renders frames through a split `AnimMgr` frame step.** The frame
loop of (1) is backend-agnostic in shape but not in mechanism: POV-Ray exports
a `.pov` per frame and queues an external process, whereas umbreon is an
in-process ray tracer. `AnimMgr::writeFrame()` calls `SceneExporter::write()`,
which for umbreon blocks the calling thread for the whole ray trace — running
it in the Web Worker would freeze the worker (and the main window's 3D view)
for seconds per frame, with no progress and no cancellation.

`AnimMgr::writeFrame()` is therefore split into a scriptable
`beginFrame()` / `endFrame()` pair — `attach` + `onTimerImpl` + `setCamera`,
then `detach` + advance — with `writeFrame()` rewritten as their composition so
the synchronous API (UXP, scripts) is unchanged. umbreon's backend runs the
already-async still cycle (`beginRender()` -> poll -> `endRender()`,
ADR-0039 / `docs/architecture/umbreon-process-isolation.md`) *between* the two
calls, one frame at a time. `endFrame()` runs from the poll handle's
`finish()`, so the frame's state stays applied to the scene for exactly as long
as the ray trace needs it.

The render-job pipeline gains one optional backend hook
(`beginInProcessAnimFrame`) and reuses everything else: the same poll timer,
the same whole-job progress arithmetic, the same frame-file naming, live
preview, ffmpeg encode and `stop()`-on-exit. An in-process movie polls at the
still-render rate (250 ms) rather than the external-process rate (700 ms),
because its progress advances continuously within a frame.

## Consequences

- Editing *other* scenes during a movie render works with no new code: the
  Rendering window is already modeless and the render target is already
  independent of the active tab. This was the main UX goal.
- Playback and seeking stop mutating scene state permanently, so the undo
  stack and the scene stop drifting apart. This fixes the animation panel,
  not just rendering — and it fixes UXP too, since the change is in
  libcuemol2.
- Stop and Pause acquire distinct semantics (Stop reverts, Pause holds).
  `AnimTransport` already exposes both buttons, so this maps onto the
  familiar media-player model, but it is a behaviour change for existing
  users and the Stop tooltip should say so.
- Coverage is exactly what each `PropAnim` subclass declares in
  `onPropSave`. A subclass that writes something it does not declare leaves
  that value unrestored, silently — the five current subclasses
  (`RealPropAnim`, `ShowHideAnim`, `SlideInOutAnim`, `RendXformAnim`,
  `MolAnim`) must each be audited against their `onPropInit` / `onStart` /
  `onEnd`, and any new subclass inherits the obligation. Cameras need no
  work: `m_pStartCam` already holds the pre-animation camera and
  `onTimerImpl` (`AnimMgr.cpp:244`) resets from it every frame.
- Editing a property during playback is silently reverted on Stop. Accepted
  for now; a future option is disabling undo/edits while `AM_RUNNING`.
- Rendering the wrong output because the target scene was edited mid-render
  remains possible. Deferred with (2) and (4).
- Both backends render movies, and the Rendering window needs no
  backend-dependent UI: the Movie settings apply unchanged to either.
- `beginFrame()` / `endFrame()` are a new public obligation on the frame
  driver — an unpaired `beginFrame()` leaves the exporter attached to the
  scene. `UmbreonBackend` therefore releases the frame from the poll handle's
  `finish()`, including when `endRender()` throws, and the pipeline calls
  `AnimMgr.stop()` on every exit path (completion, cancel, error) as before.
- A cancelled in-process movie is cooperative, not immediate: the poll loop
  must keep ticking after `renderCancel` so `finish()` can join the C++ render
  thread. The current frame therefore runs to its next cancellation boundary
  instead of dying at once (an external-process render is killed outright).
- umbreon's memory ceiling in the Electron renderer (`umbreon-process-isolation.md`)
  now applies per movie frame as well: a GI + OIDN movie at a resolution that
  crashes a still will crash the same way on its first frame.

## Notes

### Split

- **PR 1 (libcuemol2)** — decision (3) alone: `AnimMgr` save/restore plus the
  missing `stop()` call. Independent of tritium, unit-testable with gtest,
  and benefits uxp_gui immediately. Land first so the rendering work can
  assume a non-destructive `AnimMgr`.
- **PR 2 (tritium)** — decisions (1): Still/Animation mode, frame loop,
  ffmpeg encode. POV-Ray only.
- **PR 3 (libcuemol2 + tritium)** — decision (6): the `beginFrame()` /
  `endFrame()` split and the umbreon movie path.

### Implementation pointers

- `src/qsys/anim/AnimMgr.cpp` — `startImpl` (`:55-146`, save set at `:95-144`),
  `onTimerImpl` (`:239-282`), `stop` (`:167-175`), `pause` (`:177-193`),
  `goTime` (`:201-237`), `setupRender` (`:539-561`), `writeFrame` (`:564-580`).
- `worker/server/services/renderJob.service.ts` — single-frame job today
  (`RenderJobEntry` at `:62-83`, external-process path at `:358-449`,
  poll at `:438`). The `ProcessManager` two-phase constraint of ADR-0017
  (`LProcMgr` only advances its queue on `queueTask`; `getResultOutput` is
  the only slot release) applies per frame.
- `renderBackends/` — `RenderBackend` assumes one job = one image
  (`outputImagePath()`); a movie needs a different result shape.
- Decision (6): `AnimMgr::beginFrame` / `endFrame` (`AnimMgr.cpp`, exposed in
  `AnimMgr.qif`), `UmbreonBackend.beginInProcessAnimFrame`, and
  `renderJob.service.ts` `submitInProcessAnimFrame` / `pollInProcessJob`
  (which now completes a *unit* — a still job or one movie frame — rather than
  the whole job).
- ffmpeg is already staged into `bundle_apps/ffmpeg`
  (`packaging/collect-cuemol2-runtime.sh:185-191`, "future wiring"), but
  `getRenderBinaries()` (`main/ipcHandlers.ts:91-108`) does not resolve it —
  one field on `RenderBinaries` plus a Settings row.

### Traps found while scoping (verify against these when implementing)

- **`AnimMgr::startImpl` falls back to a default camera** when neither
  `startcam` nor a target view is set (`AnimMgr.cpp:76-81`) — it warns and
  continues, producing a full run of meaningless frames. `povrender.py:271`
  sets `animMgr.startcam`; the UXP GUI path (`anim-render-dlg.js:282`) does
  not, relying on the source scene's active view.
- **`PovSceneExporter` divides by zero** with neither a view nor an explicit
  height (`fac = zoom/(height*1.5)`, `:131-142`). The UXP GUI passes width /
  height to POV-Ray's `-W/-H` only (`anim-render-dlg.js:206-207,242-243`),
  never to the exporter.
- **`RendPropAnim`'s copy constructor drops `m_rendNameList`**
  (`RendPropAnim.cpp:19-24`), so `MC_CLONEABLE`-based `clone()` yields an
  AnimObj with no targets. Any future copying must go through
  `writeTo2`/`readFrom2`.
- Unresolvable animation targets are **skipped silently**
  (`RendPropAnim::fillRendArray`), so a name mismatch produces no error.

### Why duplication would work, if it is ever revisited

Animation targets persist as **names, not UIDs** — `RendPropAnim` and
subclasses store `"objname/rendname"` (`RendPropAnim.cpp:44-77`), `MolAnim`
stores `m_molName`, `CamMotion` stores `m_destCamName`, `AnimMgr` stores
`startcam`; all resolve via `getObjectByName` / `getRendByName` /
`getCamera(name)` at runtime. `PropAnim::getTgtUIDs` is runtime-only and never
serialized. A copy that preserves object/renderer/camera names therefore
carries a working `AnimMgr`.

A duplicate would need: `SceneManager::duplicateScene(uid_t)` +
`Scene::copyContentsFrom()`; objects via a private transcription of
`SceneXMLWriter.cpp:337-395` / `SceneXMLReader.cpp:313-350` (data chunks live
outside the LDom2 tree — `writeTo2` alone loses DensityMap / MolSurfObj /
ElePotMap / MorphMol data); cameras via the copy-returning
`Scene::getCamera(name)`; animation via the `writeTo2` -> `LDom2Node` ->
`readFrom2` round trip of `LWViewerManager::copyAnim`
(`src/modules/lwview/LWViewerManager.cpp:148-168`, note that `modules/lwview`
is excluded from the build at `src/CMakeLists.txt:207`); styles via an
explicit `StyleFile::loadNodes(pRoot, newSceneUID)`, since
`fromByteArray`'s styles branch registers into no scene scope. The duplicate
must keep the source's basePath, and must not reuse `toByteArray` directly —
that path also calls `forceEmbed()` (irreversible: it deletes the object's
reader options) and `setDataChunkName()` on the *source* objects.

A duplicate scene would not appear in the tritium UI as long as no view is
attached: tritium never enumerates `SceneManager` (`molTabEntries` is plain
React state), no listener subscribes `SEM_ADDED` globally, and the
unsaved-changes check resolves view -> scene only
(`getSceneCloseInfo.service.ts:18-31`). The one observable side effect is
`proposeUniqName.service.ts:32`, which probes `getSceneByName` for
`Untitled N` — a duplicate must not be named in that pattern. Note also that
`destroyScene` has no caller anywhere in tritium today.

### UXP parity reference

`uxp_gui/cuemol2/base/content/anim/anim-render-dlg.{xul,js}` (4 tabs: Main /
Render / Movie / Preview), launched modeless from
`anim-ribbon.js:214-227` (`cuemolui.onAnimRender`).
