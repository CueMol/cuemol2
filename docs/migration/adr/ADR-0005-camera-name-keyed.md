# ADR-0005: Camera operations are name-keyed at the worker boundary

- Status: accepted
- Date: 2026-05-13
- Mapping rows: [`panel.workspace.ctxmenu.camera`](../mapping/panels.md#panelworkspacectxmenucamera)

## Context

Tree rows in the scene panel are keyed by C++ `qlib::uid_t` for objects,
renderers, and groups. A natural extension would be to key cameras by
uid as well. But the underlying `qsys::Scene` API for cameras is not
uid-based: lookups, registration, and destruction all key on the
camera's **name** (`scene.getCameraRef(name)`, `scene.setCamera(name, cam)`,
`scene.destroyCamera(name)`, `scene.hasCamera(name)`). There is no
in-place rename — registering a new name requires destroying the old
entry and `setCamera`-ing under the new name.

We have to pick which key flows over the worker boundary. Mixing the
two (uid-on-display, name-on-mutation) would require a name↔uid map kept
in sync, which has nowhere to live since cameras are not first-class C++
objects with stable uids the way Renderer / Object are.

We also need to express UXP camera operations (Save from view / Apply
to view / vis-flag variants / Load / Save / Reload / Copy / Paste /
Clear vis flags), which span both navigation (no undo) and persistent
mutation (undo).

## Decision

**All camera worker services accept `cameraName: string`.** Tree rows
carry the name as their primary id; the synthesised `cameraInfo = { src,
visSize }` (built in `buildCameraRoot` from `Scene.getCameraInfoJSON`)
holds display metadata. No name↔uid map is maintained.

**Rename is atomic destroy + setCamera** in a dedicated `renameCamera`
worker — there is no in-place name setter once the camera is registered
(UXP `onRenameCamera` parity).

**Delete bypasses `deleteNode`** (which is uid-keyed) and routes through
`destroyCamera`.

**Default name suggestion** uses `proposeUniqName` extended with a
`camera` kind that walks `camera_0`, `camera_1`, ... against
`scene.hasCamera`.

**Copy / Paste** extends `sceneClipboard.service` with a `'camera'`
`ClipboardKind`:

- Copy serialises `scene.getCameraRef(name)` via `strMgr.toXML`.
- Paste decodes via `strMgr.fromXML(_, sceneId)` + `scene.setCamera`
  + `cam.notifyLoaded(scene)` under "Paste camera" txn. Name collisions
  auto-uniquify via `copy{i}_<orig>` (UXP `onCameraPaste` parity).

**Save from view / Apply to view + vis-flag variants** share
`saveViewToCamera` / `applyCameraToView` workers with a `withVisFlags:
boolean` flag (UXP `saveCamImpl` / `loadCamImpl`):

- Plain view apply runs **without an undo txn** (it's navigation, not
  mutation).
- Vis-flag apply runs under a separate "Load camera <name> settings"
  undo txn (matches UXP's nested txn structure).

**Camera file submenu.**

- *Load…* uses `DIALOG_CAMERA_OPEN` IPC + `loadCameraFromFile` worker.
  Calls `scene.loadCamera(path)` → `setCamera` under "Load camera file
  <name>" txn, then `loadViewFromCam` to apply. Also runs
  `cam.loadVisSettings(scene)` under a nested "Load camera <name>
  settings" txn when the loaded camera has `vis_size > 0` — matches UXP
  `loadCamImpl`.
- *Save / Save As…* use `DIALOG_CAMERA_SAVE` IPC + `saveCameraToFile`
  worker ("Change camera's source" undo txn). *Save* first runs
  `saveCameraToCurrentSrc` (writes to `cam.src` under "Save camera
  file" txn) and falls back to *Save As* when src is empty (UXP
  `onCamSaveFile` parity).
- *Reload* calls `reloadCameraFromSrc` worker (re-loads from `cam.src`
  + `setCamera` under "Reload camera file <name>" txn).

**Clear vis flags** via `clearCameraVisFlags` worker ("Clear visibility
flags in <name>" txn). Menu item disabled when `vis_size === 0`.

**Edit vis flags** is a Phase 6c dialog dependency (`visflagset-edit-dlg.xul`)
— menu item is rendered disabled.

## Consequences

- **The worker boundary is name-keyed** — no map sync, but rename
  flushes clipboard payloads referencing the old name (acceptable;
  UXP behaves the same).
- **Rename is two C++ operations** (destroy + setCamera) per call.
  Performance is fine because cameras are small structures.
- **Plain view apply has no Undo entry** — matches UXP and is what users
  expect (navigation isn't undoable). Vis-flag apply IS undoable.
- **`destroyCamera` and the generic `deleteNode` path are not unified.**
  This is by design — cameras are name-keyed, not uid-keyed; trying to
  unify creates more friction than the duplication.

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/worker/server/services/cameraOps.service.ts`
  — `createCamera` / `renameCamera` / `destroyCamera` /
  `saveViewToCamera` / `applyCameraToView` / `clearCameraVisFlags`
- `tritium/react-gui/src/renderer/worker/server/services/cameraFile.service.ts`
  — Load / Save / Reload
- `tritium/react-gui/src/renderer/worker/server/services/sceneClipboard.service.ts`
  — `'camera'` ClipboardKind branch
- `tritium/react-gui/src/renderer/worker/server/services/sceneTree.service.ts`
  — `cameraInfo` synthesis from `getCameraInfoJSON`
- `tritium/react-gui/src/renderer/worker/server/services/proposeUniqName.service.ts`
  — `camera` kind

### UXP parity

- `uxp_gui/cuemol2/base/content/workspace_panel.js` — `loadCamImpl`,
  `saveCamImpl`, `onRenameCamera`, `onCameraPaste`, `onCamSaveFile`

### Pending

- Edit vis flags dialog (Phase 6c)
- Properties — depends on the per-type property editor (Phase 5)

### Related ADRs

- *(none yet — Camera-related interactions are isolated from the other
  ctxmenu ADRs)*
